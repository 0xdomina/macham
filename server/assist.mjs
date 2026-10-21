// Macham assist gateway (reference server). Merchants call POST /v1/assist
// with their mch_ key. Model keys never leave this process. Usage meters
// per key against plan limits. Failures are never billed.
//
// Run:  node server/assist.mjs        (reads ./.env, listens ASSIST_PORT)
// Mint: node server/keys.mjs mint --env test
//
// Env: ASSIST_PORT (default 8787), KEYSTORE_PATH (default ./data/keystore.json),
// ASSIST_CORS (comma origins, default none), ASSIST_DEFAULT_PLAN (free|pro|team),
// RATE_LIMIT_PER_MIN (default 60), GROQ_API_KEY, DEEPSEEK_API_KEY.

import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(ROOT)
const DIST = new URL("../dist/", import.meta.url).href

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#")) continue
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
}
loadEnvFile(resolve(ROOT, ".env"))

const { parseKey, verifyKey, fingerprintOf } = await import(DIST + "auth/keys.js")
const { FileKeyStore, currentMonth } = await import(DIST + "auth/keystore.js")
const { RateLimiter } = await import(DIST + "auth/ratelimit.js")
const { ProviderRouter } = await import(DIST + "providers/router.js")
const serverProviders = await import(DIST + "providers/openai-compatible.js")
const { PLANS, checkLimits } = await import(DIST + "billing/plans.js")
const { Channel3Client } = await import(DIST + "catalog/channel3.js")
const { ElasticCatalog } = await import(DIST + "catalog/elastic.js")
const { runCapability, capabilityNames } = await import("./capabilities.mjs")
const { PayPalRail, withinCaptureTolerance } = await import(DIST + "rails/paypal.js")
const { anchorSettlement, readSettlementAudit, settlementNetwork, settlementWritesEnabled, anchorEventFromBody } = await import("./audit.mjs")

const PORT = Number(process.env.ASSIST_PORT ?? "8787")
const CORS = (process.env.ASSIST_CORS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
const PLAN = PLANS[process.env.ASSIST_DEFAULT_PLAN] ?? PLANS.free
const STORE_PATH = process.env.KEYSTORE_PATH ?? "./data/keystore.json"
// The browser SDK the store owner pastes as a one-line snippet
// (<script src="https://YOUR-MACHAM-HOST/macham.js">). Served same-origin so the
// widget's /v1 calls need no CORS. Store owners connect and preview on the
// website; this endpoint only ships the bundle. No PWA launcher here.
const STATIC = {
  "/macham.js": { file: "dist-loader/macham.js", type: "application/javascript; charset=utf-8", cache: "public, max-age=300" },
}
// Fresh store per request: revocation takes effect immediately and mint-then-use
// works without restarts. Postgres replaces this backend under load.
const loadStore = () => new FileKeyStore(STORE_PATH)
const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MIN ?? "60"))

const brains = []
if (process.env.GROQ_API_KEY) brains.push(new serverProviders.OpenAICompatibleProvider({ name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b" }))
if (process.env.DEEPSEEK_API_KEY) brains.push(new serverProviders.OpenAICompatibleProvider({ name: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: process.env.DEEPSEEK_API_KEY, model: "deepseek-chat" }))
if (!brains.length) {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg: "No model keys. Set GROQ_API_KEY." }))
  process.exit(1)
}
const router = new ProviderRouter({ providers: brains })

// PayPal Orders v2. Live only when both credentials are present; otherwise the
// orders routes fail closed instead of pretending to charge.
const PAYPAL_ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
let paypal = null
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
  try {
    paypal = new PayPalRail({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      env: PAYPAL_ENV,
    })
  } catch (e) {
    console.log(JSON.stringify({ t: new Date().toISOString(), msg: "PayPal not configured.", error: String(e?.message ?? e) }))
  }
}
const orders = new Map()

function log(id, method, path, status, ms, extra) {
  console.log(JSON.stringify({ t: new Date().toISOString(), id, method, path, status, ms, ...extra }))
}

function readBody(req, cap = 65536) {
  return new Promise((resolve, reject) => {
    const parts = []
    let size = 0
    req.on("data", (c) => {
      size += c.length
      if (size > cap) reject(new Error("Body too large."))
      else parts.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")))
    req.on("error", reject)
  })
}

function moneyMinor(v) {
  return Number.isInteger(v) && v > 0 && v <= 100_000_000
}

function currencyCode(v) {
  return typeof v === "string" && /^[A-Z]{3}$/.test(v.toUpperCase())
}

async function handleOrder(req, done, { record, orderPath }) {
  if (!paypal) return done(503, { error: "PayPal is not configured on this server." })
  if (!record.scopes.orders) return done(403, { error: "Key lacks orders scope." })
  if (!limiter.take(record.fingerprint + ":orders")) return done(429, { error: "Too many order requests. Slow down." })
  const orderId = orderPath[1] ? decodeURIComponent(orderPath[1]) : ""
  const action = orderPath[2] || ""
  let body = {}
  if (req.method === "POST") {
    try {
      const raw = await readBody(req)
      body = raw ? JSON.parse(raw) : {}
    } catch {
      return done(400, { error: "Body unreadable. Send JSON." })
    }
  }
  try {
    if (!orderId && req.method === "POST") {
      if (!moneyMinor(body.amountMinor)) return done(400, { error: "amountMinor must be positive integer minor units." })
      if (!currencyCode(body.currency)) return done(400, { error: "currency must be a 3-letter code." })
      if (typeof body.invoiceId !== "string" || !body.invoiceId.trim()) return done(400, { error: "invoiceId is required." })
      const intent = body.intent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE"
      const order = await paypal.createOrder({
        amountMinor: body.amountMinor,
        currency: body.currency.toUpperCase(),
        invoiceId: body.invoiceId.trim(),
        intent,
        description: typeof body.description === "string" ? body.description.slice(0, 120) : undefined,
      })
      orders.set(order.id, {
        amountMinor: body.amountMinor,
        currency: body.currency.toUpperCase(),
        invoiceId: body.invoiceId.trim(),
        intent,
        status: order.status,
        createdAt: Date.now(),
      })
      return done(200, { order, paypal: PAYPAL_ENV })
    }
    if (!orderId) return done(404, { error: "Order id needed." })
    const local = orders.get(orderId)
    if (!local) return done(404, { error: "Order not found on this server." })
    if (req.method === "GET" && !action) {
      const order = await paypal.getOrder(orderId)
      return done(200, { order, local })
    }
    if (req.method !== "POST") return done(404, { error: "Unknown order action." })

    if (action === "authorize") {
      if (local.intent !== "AUTHORIZE") return done(409, { error: "This order was created for capture, not authorization." })
      const order = await paypal.authorizeOrder(orderId)
      if (!order.authorizationId) return done(502, { error: "PayPal returned no authorization id." })
      local.authorizationId = order.authorizationId
      local.status = order.status
      orders.set(orderId, local)
      return done(200, { order, local })
    }
    if (action === "capture") {
      const finalMinor = body.finalMinor == null ? local.amountMinor : body.finalMinor
      if (!moneyMinor(finalMinor)) return done(400, { error: "finalMinor must be positive integer minor units." })
      if (!withinCaptureTolerance(local.amountMinor, finalMinor)) return done(409, { error: "Outside capture tolerance. Re-quote." })
      let capture
      if (local.intent === "AUTHORIZE") {
        if (!local.authorizationId) return done(409, { error: "Authorize the order before capturing." })
        capture = await paypal.captureAuthorization(local.authorizationId, finalMinor, local.currency)
      } else {
        capture = await paypal.captureOrder(orderId, finalMinor, local.amountMinor)
      }
      const captured = capture?.purchase_units?.[0]?.payments?.captures?.[0]
      local.status = capture?.status ?? "COMPLETED"
      local.captureId = captured?.id ?? local.captureId
      local.capturedMinor = finalMinor
      // Best-effort on-chain proof. anchorSettlement never throws and never
      // blocks the capture: a missing key or unreachable chain yields null.
      const audit = await anchorSettlement({
        kind: "paypal-captured",
        ref: orderId,
        actor: local.invoiceId,
        payload: { amountMinor: finalMinor, currency: local.currency },
      })
      local.auditSignature = audit.signature
      orders.set(orderId, local)
      return done(200, { capture, local, audit })
    }
    if (action === "void") {
      if (!local.authorizationId) return done(409, { error: "No authorization to void." })
      const out = await paypal.voidAuthorization(local.authorizationId)
      local.status = "VOIDED"
      orders.set(orderId, local)
      return done(200, { void: out, local })
    }
    if (action === "refund") {
      const captureId = String(body.captureId || local.captureId || "").trim()
      if (!captureId) return done(409, { error: "No capture to refund." })
      const amountMinor = body.amountMinor == null ? (local.capturedMinor ?? local.amountMinor) : body.amountMinor
      if (!moneyMinor(amountMinor)) return done(400, { error: "amountMinor must be positive integer minor units." })
      const out = await paypal.refundCapture(captureId, amountMinor, local.currency)
      local.refundedMinor = amountMinor
      orders.set(orderId, local)
      return done(200, { refund: out, local })
    }
    return done(404, { error: "Unknown order action." })
  } catch (e) {
    return done(502, { error: String(e?.message ?? e).slice(0, 300) })
  }
}

function validMessages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) return false
  return value.every((m) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length > 0 && m.content.length <= 4000)
}

const STORE_ORIGINS = (process.env.ASSIST_STORE_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)

// SSRF guard: the resolve lane fetches attacker-supplied store URLs.
// Public hosts only. Loopback, private ranges, link-local (v4 + v6), and
// odd schemes refuse before any fetch happens. Numeric IPv4 forms
// (decimal, hex, octal) are normalized to octets first so they cannot
// slip past the string tests.
function ipv4Octets(host) {
  const parts = host.split(".")
  if (parts.length !== 4) return null
  const out = []
  for (const part of parts) {
    if (!part) return null
    let n
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16)
    else if (/^0[0-9]+$/.test(part)) {
      if (/[89]/.test(part)) return null
      n = parseInt(part, 8)
    } else if (/^\d+$/.test(part)) n = parseInt(part, 10)
    else return null
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    out.push(n)
  }
  return out
}

function intToOctets(n) {
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) return null
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function isBlockedIp(host) {
  if (host === "localhost") return true
  if (host.includes("%")) return true
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const o = intToOctets(parseInt(host, 16))
    return o ? isBlockedOctets(o) : true
  }
  if (/^0[0-7]+$/.test(host) && host.length > 1) {
    const o = intToOctets(parseInt(host, 8))
    return o ? isBlockedOctets(o) : true
  }
  if (/^\d+$/.test(host)) {
    const o = intToOctets(Number(host))
    return o ? isBlockedOctets(o) : true
  }
  if (host.includes(".")) {
    const parts = host.split(".")
    if (parts.length < 4 && parts.every((p) => /^[0-9a-fx]+$/i.test(p))) return true
    const dotted = ipv4Octets(host)
    if (dotted) return isBlockedOctets(dotted)
  }
  if (host.includes(":")) {
    const h = host.toLowerCase()
    if (h === "::1") return true
    if (h.startsWith("fc") || h.startsWith("fd")) return true
    if (h === "fe80" || h.startsWith("fe80:") || h.startsWith("fe80::")) return true
    const quad = h.split(":").pop()
    if (quad && quad.includes(".")) {
      const dotted = ipv4Octets(quad)
      if (dotted) return isBlockedOctets(dotted)
      return true
    }
    return true
  }
  return false
}

function isBlockedOctets(o) {
  if (o[0] === 127 || o[0] === 0 || o[0] === 10) return true
  if (o[0] === 192 && o[1] === 168) return true
  if (o[0] === 169 && o[1] === 254) return true
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true
  if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true
  if (o[0] === 192 && o[1] === 0 && o[2] === 2) return true
  if (o[0] === 198 && o[1] === 51 && o[2] === 100) return true
  if (o[0] === 203 && o[1] === 0 && o[2] === 113) return true
  if (o[0] >= 224 && o[0] <= 239) return true
  if (o[0] >= 240) return true
  return false
}

function publicStoreOrigin(raw) {
  let url
  try {
    url = new URL(String(raw ?? "").trim())
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!host || host.length > 253) return null
  if (isBlockedIp(host)) return null
  return url.origin
}

// DNS rebinding guard: the hostname must not resolve to a blocked address.
async function originResolvesPublic(rawOrigin) {
  let hostname
  try {
    hostname = new URL(rawOrigin).hostname
  } catch {
    return false
  }
  let lookup
  try {
    lookup = (await import("node:dns")).promises.lookup
  } catch {
    return false
  }
  try {
    const records = await lookup(hostname, { all: true })
    if (!records.length) return false
    return records.every((r) => !isBlockedIp(String(r.address ?? "")))
  } catch {
    return false
  }
}

// Redirect + induction guard: manual redirects, every hop re-validated,
// and every fetched input validated up front (sitemap/page URLs induced by
// attacker content die here, not inside a following fetcher). A 302 to a
// private address dies here instead of inside a following fetcher.
// Note: all IPv6 literals refuse, including public ones. DNS names with
// AAAA records pass. Safe direction, documented.
async function guardedFetch(input, init, hops = 3) {
  const target = typeof input === "string" ? input : input.url
  if (!publicStoreOrigin(target)) {
    throw new Error("Fetch not allowed.")
  }
  const origin = new URL(target).origin
  if (!(await originResolvesPublic(origin))) {
    throw new Error("Fetch not allowed.")
  }
  const res = await fetch(input, { ...(init ?? {}), redirect: "manual" })
  const location = res.headers.get("location")
  if (
    hops > 0 &&
    location &&
    res.status >= 300 &&
    res.status < 400
  ) {
    const next = new URL(location, typeof input === "string" ? input : input.url)
    if (!publicStoreOrigin(next.href)) {
      throw new Error("Redirect not allowed.")
    }
    if (!(await originResolvesPublic(next.origin))) {
      throw new Error("Redirect not allowed.")
    }
    return guardedFetch(next.href, init, hops - 1)
  }
  return res
}

function safeHostname(raw) {
  try {
    const url = new URL(String(raw ?? ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.hostname.replace(/^www\./, "") || null
  } catch {
    return null
  }
}

// Shop-any-store catalog: resolves a product link or search words through
// Channel3 behind the server key. First-party PWA keys carry catalog scope
// only. Origin-checked when ASSIST_STORE_ORIGINS is set.
async function handleResolve(req, res, done, ctx) {
  const { record, store, limiter, id } = ctx
  if (!record.scopes.catalog) return done(403, { error: "Key lacks catalog scope." })
  if (STORE_ORIGINS.length) {
    const from = req.headers.origin ?? req.headers.referer ?? ""
    if (!STORE_ORIGINS.some((o) => from.startsWith(o))) return done(403, { error: "Origin not allowed." })
  }
  if (!limiter.take(record.fingerprint + ":catalog")) return done(429, { error: "Too many requests. Slow down." })
  const hasChannel3 = Boolean(process.env.CHANNEL3_API_KEY)
  const hasKernel = Boolean(process.env.KERNEL_API_KEY)
  // Elastic is the merchant's own indexed catalog. Opt-in: fully inert unless
  // both ELASTIC_URL and ELASTIC_KEY are set. Uses the default fetch (trusted,
  // operator-configured endpoint — may be self-hosted on loopback).
  const hasElastic = Boolean(process.env.ELASTIC_URL && process.env.ELASTIC_KEY)
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return done(400, { error: "Body unreadable. Send JSON." })
  }
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 500) : ""
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : ""
  if (!url && !query) return done(400, { error: "Send a link or search words." })
  // A free-text search needs Channel3 or Elastic; a link can still be read
  // keylessly (first-party adapter) or via the kernel.
  if (!url && !hasChannel3 && !hasElastic) return done(503, { error: "Catalog unavailable. Retry." })
  const limit = Math.min(Math.max(Number(body.limit ?? 12) || 12, 1), 24)
  const client = hasChannel3 ? new Channel3Client(process.env.CHANNEL3_API_KEY) : null
  const elastic = hasElastic ? new ElasticCatalog(process.env.ELASTIC_URL, process.env.ELASTIC_KEY) : null
  const toResolve = (p) => {
    let domain = p.offers?.[0]?.domain ?? null
    const metaHost = p.metadata?.url ? safeHostname(p.metadata.url) : null
    if (metaHost) domain = metaHost
    else if (!domain && url) domain = safeHostname(url)
    return {
      title: typeof p.title === "string" ? p.title : "Untitled",
      image: p.imageUrl ?? p.images?.[0] ?? null,
      url: typeof p.metadata?.url === "string" ? p.metadata.url : (p.offers?.[0]?.url ?? url ?? null),
      domain,
      amountMinor: p.price?.amountMinor ?? p.offers?.[0]?.priceMinor ?? null,
      currency: p.price?.currency ?? p.offers?.[0]?.currency ?? null,
    }
  }
  const mapRows = (rows) => {
    const out = []
    for (const p of rows) {
      try {
        out.push(toResolve(p))
      } catch {
        continue
      }
    }
    return out
  }
  let found = []
  try {
    if (url) {
      const origin = publicStoreOrigin(url)
      if (!origin) return done(400, { error: "Link not allowed. Send a public store link." })
      if (!(await originResolvesPublic(origin))) return done(400, { error: "Link not allowed. Send a public store link." })
      // Zero-code lane first: the store's own public endpoints. No keys.
      try {
        const { UniversalAdapter } = await import(DIST + "adapters/universal.js")
        const store = new UniversalAdapter(origin, guardedFetch, { timeoutMs: 8000 })
        if (await store.detect()) {
          const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
          const one = slug ? await store.getProduct(slug) : null
          found = one ? mapRows([one]) : mapRows(await store.listProducts({ limit }))
          if (found.length) return okWithUsage(found)
        }
      } catch {
        // Fall through to enrichment.
      }
      // Kernel lane: render the page and read client-hydrated JSON-LD the raw
      // fetch above cannot see. Read-only, budget-capped, fails closed.
      if (hasKernel) {
        try {
          const { kernelLaneFactory } = await import(DIST + "browser/kernel.js")
          const { productsFromJsonLdText } = await import(DIST + "adapters/universal.js")
          const lane = await kernelLaneFactory(process.env.KERNEL_API_KEY)({ url, headless: true })
          try {
            const gone = await lane.goto(url)
            if (gone.ok) {
              const ex = await lane.act({ kind: "extract", target: "script[type=\"application/ld+json\"]", schema: "product" })
              if (ex.ok && typeof ex.data === "string") {
                const rows = mapRows(productsFromJsonLdText(ex.data, url))
                if (rows.length) return okWithUsage(rows)
              }
            }
          } finally {
            await lane.close()
          }
        } catch {
          // Kernel unavailable or rejected: fall through to Channel3.
        }
      }
      if (client) {
        const one = await client.lookup(url)
        found = one ? [one] : []
        if (!found.length) {
          const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
          const guess = slug.replace(/[-_+]+/g, " ").replace(/\.\w+$/, "").trim()
          if (guess) found = await client.search(guess, { limit })
        }
      }
    } else {
      // Free-text: the merchant's own Elastic catalog first (most accurate),
      // then Channel3 cross-retailer. Each fails closed into the next.
      if (elastic) {
        try { found = await elastic.search(query, { limit }) } catch { found = [] }
      }
      if (!found.length && client) found = await client.search(query, { limit })
    }
  } catch {
    return done(503, { error: "Catalog unavailable. Retry." })
  }
  async function okWithUsage(rows) {
    const month = currentMonth()
    const usage = store.getUsage(record.fingerprint, month)
    const gate = checkLimits(PLAN, { assistedSessions: usage.sessions, modelCalls: usage.modelCalls, seats: 1 })
    if (!gate.ok) return done(429, { error: "Plan limit reached. Upgrade to continue." })
    store.addUsage(record.fingerprint, month, { sessions: 1 })
    return done(200, { products: rows.slice(0, limit) })
  }
  const month = currentMonth()
  const usage = store.getUsage(record.fingerprint, month)
  const gate = checkLimits(PLAN, { assistedSessions: usage.sessions, modelCalls: usage.modelCalls, seats: 1 })
  if (!gate.ok) return done(429, { error: "Plan limit reached. Upgrade to continue." })
  store.addUsage(record.fingerprint, month, { sessions: 1 })
  return done(200, { products: mapRows(found).slice(0, limit) })
}

// POST /v1/settlement/anchor — write one event to the Rialo audit trail.
// Orders-scoped, rate-limited, best-effort: an audit failure is reported as
// anchored:false, never a 5xx, because settlement must not depend on the chain.
async function handleSettlementAnchor(req, done, { record }) {
  if (!record.scopes.orders) return done(403, { error: "Key lacks orders scope." })
  if (!limiter.take(record.fingerprint + ":settlement")) return done(429, { error: "Too many settlement requests. Slow down." })
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return done(400, { error: "Body unreadable. Send JSON." })
  }
  const result = await anchorSettlement(anchorEventFromBody(body))
  return done(200, { ...result, network: settlementNetwork() })
}

// GET /v1/settlement/audit/:ref — read anchored events for a reference.
// Reading public proof (ref + signature) needs only an authenticated key;
// writing an anchor stays gated on the orders scope above.
async function handleSettlementAudit(done, { record, ref }) {
  if (!record.scopes.orders && !record.scopes.catalog && !record.scopes.assist) {
    return done(403, { error: "Key not authorised." })
  }
  if (!limiter.take(record.fingerprint + ":audit")) return done(429, { error: "Too many settlement requests. Slow down." })
  const result = await readSettlementAudit(ref)
  return done(200, { ...result, enabled: settlementWritesEnabled() })
}

const server = createServer(async (req, res) => {
  const id = randomUUID()
  const started = Date.now()
  const url = new URL(req.url ?? "/", "http://x")
  const origin = req.headers.origin
  const corsOpen = Boolean(origin && CORS.includes(origin))
  if (corsOpen) {
    res.setHeader("access-control-allow-origin", origin)
    res.setHeader("vary", "origin")
    res.setHeader("access-control-allow-headers", "authorization, content-type")
  }
  const done = (status, body, extra) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(body))
    log(id, req.method, url.pathname, status, Date.now() - started, extra)
  }
  try {
    if (req.method === "GET" && url.pathname === "/health") return done(200, { ok: true, plan: PLAN.id, uptime_s: Math.floor(process.uptime()) })
    const asset = req.method === "GET" ? STATIC[url.pathname] : null
    if (asset) {
      try {
        const buf = readFileSync(resolve(ROOT, asset.file))
        res.writeHead(200, { "content-type": asset.type, "cache-control": asset.cache })
        res.end(buf)
        return log(id, req.method, url.pathname, 200, Date.now() - started)
      } catch {
        return done(404, { error: "Snippet not built. Run npm run build:loader." })
      }
    }
    if (req.method === "OPTIONS") {
      if (corsOpen) {
        res.writeHead(204, {
          "access-control-allow-origin": origin,
          vary: "origin",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400",
        })
      } else {
        res.writeHead(204)
      }
      res.end()
      return log(id, req.method, url.pathname, 204, Date.now() - started)
    }
    const orderPath = url.pathname.match(/^\/v1\/orders(?:\/([^/]+)(?:\/(authorize|capture|void|refund))?)?$/)
    const assistPath = url.pathname === "/v1/assist" || url.pathname === "/v1/catalog/resolve" || url.pathname === "/v1/assist/capability"
    const anchorPath = req.method === "POST" && url.pathname === "/v1/settlement/anchor"
    const auditM = url.pathname.match(/^\/v1\/settlement\/audit\/([^/]+)$/)
    const auditPath = Boolean(auditM) && req.method === "GET"
    if (!assistPath && !orderPath && !anchorPath && !auditPath) return done(404, { error: "Unknown endpoint." })
    const allowedGet = (orderPath && orderPath[1] && !orderPath[2]) || auditPath
    if (req.method === "GET" && !allowedGet) return done(404, { error: "Unknown endpoint." })
    if (req.method !== "POST" && req.method !== "GET") return done(404, { error: "Unknown endpoint." })
    const presented = (req.headers.authorization ?? "").replace(/^Bearer /i, "").trim()
    if (!parseKey(presented)) return done(401, { error: "Key rejected. Check the dashboard." })
    const store = loadStore()
    const record = store.findByFingerprint(fingerprintOf(presented))
    if (!record) return done(401, { error: "Key rejected. Check the dashboard." })
    const check = verifyKey(record, presented)
    if (!check.ok) return done(401, { error: check.reason === "Key revoked." ? "Key revoked." : "Key rejected. Check the dashboard." })
    if (orderPath) return await handleOrder(req, done, { record, orderPath })
    if (url.pathname === "/v1/catalog/resolve") return await handleResolve(req, res, done, { record, store, limiter, id })
    if (anchorPath) return await handleSettlementAnchor(req, done, { record })
    if (auditPath) return await handleSettlementAudit(done, { record, ref: decodeURIComponent(auditM[1]) })
    if (url.pathname === "/v1/assist/capability") {
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return done(400, { error: "Body unreadable. Send JSON." })
      }
      if (!limiter.take(record.fingerprint + ":capability")) return done(429, { error: "Too many requests. Slow down." })
      const month = currentMonth()
      const usage = store.getUsage(record.fingerprint, month)
      const gate = checkLimits(PLAN, { assistedSessions: usage.sessions, modelCalls: usage.modelCalls, seats: 1 })
      if (!gate.ok) return done(429, { error: "Plan limit reached. Upgrade to continue." })
      try {
        const value = await runCapability(router, record.id, body.capability, body.input, body.context)
        store.addUsage(record.fingerprint, month, { sessions: 1, modelCalls: 1 })
        return done(200, { capability: body.capability, result: value })
      } catch (e) {
        if (e?.status === 400) return done(400, { error: e.message })
        return done(503, { error: "Assistant answer invalid. Retry." })
      }
    }
    if (!record.scopes.assist) return done(403, { error: "Key lacks assist scope." })
    if (!limiter.take(record.fingerprint)) return done(429, { error: "Too many requests. Slow down." })
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return done(400, { error: "Body unreadable. Send JSON." })
    }
    if (!validMessages(body.messages)) return done(400, { error: "Messages invalid. Send 1 to 20 texts." })
    const month = currentMonth()
    const usage = store.getUsage(record.fingerprint, month)
    const gate = checkLimits(PLAN, { assistedSessions: usage.sessions, modelCalls: usage.modelCalls, seats: 1 })
    if (!gate.ok) return done(429, { error: "Plan limit reached. Upgrade to continue." })
    let result
    try {
      result = await router.chat(body.messages, { maxTokens: Math.min(1024, body.max_tokens ?? 512), temperature: body.temperature ?? 0.3, tenantId: record.id })
    } catch {
      return done(503, { error: "Assistant unavailable. Retry." })
    }
    store.addUsage(record.fingerprint, month, { sessions: 1, modelCalls: 1 })
    return done(200, { text: result.text })
  } catch {
    return done(500, { error: "Request failed. Retry." })
  }
})

server.listen(PORT, () => console.log(JSON.stringify({ t: new Date().toISOString(), msg: `Assist up. Port ${PORT}. Plan ${PLAN.id}.` })))
