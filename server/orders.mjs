// Money path for the assist gateway. The server prices every order from the
// store's own catalog. A client-sent amount is only a claim: it must match
// the catalog exactly or the request is refused. Capture always uses the
// amount stored at order creation, never a number sent at capture time.
// Orders are scoped per key (tenant), persisted to disk, and idempotent:
// the PayPal request id is derived from cart + invoice + tenant, not random.

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export const MAX_LINES = 10
export const MAX_QTY = 20
export const MAX_TOTAL_MINOR = 100_000_000

export class OrderError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const isMoney = (v) => Number.isInteger(v) && v > 0 && v <= MAX_TOTAL_MINOR

/** Stable key: same tenant, store, cart and invoice always give the same key. */
export function idempotencyKeyFor({ tenant, storeUrl, lines, invoiceId }) {
  const canon = JSON.stringify({
    t: String(tenant),
    s: String(storeUrl),
    i: String(invoiceId),
    l: lines.map((l) => [String(l.id), l.qty]),
  })
  return createHash("sha256").update(canon).digest("hex").slice(0, 32)
}

/** Validate the cart shape. Prices are NOT read from here. */
export function parseLines(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_LINES) {
    throw new OrderError(400, `items needed: 1 to ${MAX_LINES} lines.`)
  }
  return items.map((raw) => {
    const id = typeof raw?.id === "string" ? raw.id.trim().slice(0, 200) : ""
    const qty = raw?.qty == null ? 1 : raw.qty
    if (!id) throw new OrderError(400, "Each item needs a product id.")
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new OrderError(400, `qty must be a whole number 1 to ${MAX_QTY}.`)
    }
    return { id, qty }
  })
}

/**
 * Price the cart from catalog rows. products[i] is the store's row for
 * lines[i] (or null when the store does not know it). Fails closed.
 */
export function buildQuote(lines, products) {
  let currency = null
  let amountMinor = 0
  const priced = lines.map((line, i) => {
    const p = products[i]
    if (!p) throw new OrderError(404, `Product not found: ${line.id}.`)
    const unit = p.price?.amountMinor
    const cur = String(p.price?.currency ?? "").toUpperCase()
    if (!isMoney(unit)) throw new OrderError(409, `No fixed price for ${line.id}.`)
    if (!/^[A-Z]{3}$/.test(cur)) throw new OrderError(409, `No currency for ${line.id}.`)
    if (currency && currency !== cur) throw new OrderError(409, "Mixed currencies in one cart.")
    currency = cur
    const lineMinor = unit * line.qty
    amountMinor += lineMinor
    return { id: line.id, title: String(p.title ?? line.id).slice(0, 120), unitMinor: unit, qty: line.qty, lineMinor }
  })
  if (!isMoney(amountMinor)) throw new OrderError(409, "Cart total out of range.")
  return { currency, amountMinor, lines: priced }
}

/** A client-supplied amount is a claim. Refuse any mismatch with the catalog. */
export function assertClaimMatches(claimed, quote) {
  if (claimed === undefined || claimed === null) return
  if (!Number.isInteger(claimed) || claimed !== quote.amountMinor) {
    throw new OrderError(409, "Price mismatch with the store catalog. Re-quote.")
  }
}

/** File-backed ledger. Atomic writes. Tenant-scoped reads. */
export class OrderLedger {
  constructor(path) {
    this.path = path
    this.orders = new Map()
    if (path && existsSync(path)) {
      try {
        const rows = JSON.parse(readFileSync(path, "utf8"))
        for (const o of rows) this.orders.set(o.id, o)
      } catch {
        this.orders = new Map()
      }
    }
  }

  persist() {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify([...this.orders.values()]))
    renameSync(tmp, this.path)
  }

  put(order) {
    this.orders.set(order.id, order)
    this.persist()
    return order
  }

  /** Returns the order only if it belongs to this tenant. */
  get(id, tenant) {
    const o = this.orders.get(id)
    return o && o.tenant === tenant ? o : null
  }

  byIdem(tenant, key) {
    for (const o of this.orders.values()) if (o.tenant === tenant && o.idemKey === key) return o
    return null
  }
}

/**
 * Create a PayPal order priced by the catalog.
 * deps: { ledger, paypal, resolveProduct(storeUrl, id) -> Product|null, env }
 */
export async function createPricedOrder({ deps, tenant, body }) {
  const { ledger, paypal, resolveProduct } = deps
  if (typeof body?.storeUrl !== "string" || !body.storeUrl.trim()) {
    throw new OrderError(400, "storeUrl needed.")
  }
  const storeUrl = body.storeUrl.trim().slice(0, 300)
  const lines = parseLines(body.items)
  if (typeof body.invoiceId !== "string" || !body.invoiceId.trim()) {
    throw new OrderError(400, "invoiceId is required.")
  }
  const invoiceId = body.invoiceId.trim().slice(0, 127)
  const intent = body.intent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE"
  const idemKey = idempotencyKeyFor({ tenant, storeUrl, lines, invoiceId })

  // Same cart, same invoice, same key: replay the existing order, never a second charge.
  const existing = ledger.byIdem(tenant, idemKey)
  if (existing) return { status: 200, body: { order: existing.paypalView, local: publicOrder(existing), replay: true } }

  const products = []
  for (const line of lines) {
    products.push(await resolveProduct(storeUrl, line.id))
  }
  const quote = buildQuote(lines, products)
  assertClaimMatches(body.amountMinor, quote)

  const order = await paypal.createOrder({
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    invoiceId,
    intent,
    description: typeof body.description === "string" ? body.description.slice(0, 120) : undefined,
    idempotencyKey: idemKey,
  })
  const local = {
    id: order.id,
    tenant,
    idemKey,
    storeUrl,
    invoiceId,
    intent,
    lines: quote.lines,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    status: order.status,
    createdAt: Date.now(),
    paypalView: order,
  }
  ledger.put(local)
  return { status: 200, body: { order, local: publicOrder(local) } }
}

export function publicOrder(o) {
  return {
    id: o.id,
    status: o.status,
    intent: o.intent,
    amountMinor: o.amountMinor,
    currency: o.currency,
    lines: o.lines,
    captureId: o.captureId ?? null,
    capturedMinor: o.capturedMinor ?? null,
    refundedMinor: o.refundedMinor ?? null,
    auditSignature: o.auditSignature ?? null,
  }
}

/**
 * Capture at the stored amount only. A body amount that differs is refused,
 * not tolerated. After PayPal answers, the order is fetched again and must
 * show COMPLETED for the same amount before it is marked settled.
 */
export async function captureStoredOrder({ deps, tenant, orderId, body, anchor }) {
  const { ledger, paypal } = deps
  const local = ledger.get(orderId, tenant)
  if (!local) throw new OrderError(404, "Order not found.")
  if (local.intent === "AUTHORIZE") throw new OrderError(409, "Authorize the order before capturing.")
  if (local.status === "COMPLETED" && local.captureId) return { status: 200, body: { local: publicOrder(local), replay: true } }
  if (body?.finalMinor !== undefined && body.finalMinor !== null && body.finalMinor !== local.amountMinor) {
    throw new OrderError(409, "Amount mismatch with the approved total. Re-quote.")
  }
  const capture = await paypal.captureOrder(orderId, local.amountMinor, local.amountMinor, undefined, local.idemKey)
  const check = await paypal.getOrder(orderId)
  const cap = check?.purchase_units?.[0]?.payments?.captures?.[0] ?? capture?.purchase_units?.[0]?.payments?.captures?.[0]
  const capturedValue = cap?.amount?.value
  const ok =
    check?.status === "COMPLETED" &&
    cap?.status === "COMPLETED" &&
    capturedValue === (local.amountMinor / 100).toFixed(2) &&
    cap?.amount?.currency_code === local.currency
  if (!ok) {
    local.status = "UNVERIFIED"
    ledger.put(local)
    throw new OrderError(502, "PayPal capture could not be verified. Not marked paid.")
  }
  local.status = "COMPLETED"
  local.captureId = cap.id
  local.capturedMinor = local.amountMinor
  ledger.put(local)
  const audit = anchor ? await anchor({ kind: "paypal-captured", ref: orderId, actor: local.invoiceId, payload: { amountMinor: local.amountMinor, currency: local.currency } }) : { signature: null }
  local.auditSignature = audit?.signature ?? null
  ledger.put(local)
  return { status: 200, body: { capture, local: publicOrder(local), audit } }
}
