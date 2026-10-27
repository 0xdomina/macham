import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OrderLedger, OrderError, idempotencyKeyFor, parseLines, buildQuote, assertClaimMatches, createPricedOrder, captureStoredOrder } from "../server/orders.mjs"

const CATALOG = {
  "sku-1": { id: "sku-1", title: "Tee", price: { amountMinor: 250000, currency: "NGN" } },
  "sku-2": { id: "sku-2", title: "Cap", price: { amountMinor: 80000, currency: "NGN" } },
}

function fakePaypal(overrides = {}) {
  const calls = { create: [], capture: [], get: 0 }
  return {
    calls,
    async createOrder(input) {
      calls.create.push(input)
      return { id: "ORD-" + calls.create.length, status: "CREATED", approveUrl: "https://approve" }
    },
    async captureOrder(id, finalMinor, authorizedMinor, _f, key) {
      calls.capture.push({ id, finalMinor, authorizedMinor, key })
      return { id: "X", status: "COMPLETED" }
    },
    async getOrder(id) {
      calls.get++
      if (overrides.getOrder) return overrides.getOrder(id)
      return {
        id,
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { value: "3300.00", currency_code: "NGN" } }] } }],
      }
    },
  }
}

function harness(paypal) {
  const dir = mkdtempSync(join(tmpdir(), "macham-orders-"))
  const path = join(dir, "orders.json")
  const ledger = new OrderLedger(path)
  const resolveProduct = async (_store, id) => CATALOG[id] ?? null
  const deps = { ledger, paypal, resolveProduct }
  return { dir, path, ledger, deps, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const STORE = "https://shop.example"
const ITEMS = [{ id: "sku-1", qty: 1 }, { id: "sku-2", qty: 1 }]

test("server prices the cart from the catalog, never the client", async () => {
  const h = harness(fakePaypal())
  try {
    const out = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-1" } })
    assert.equal(out.status, 200)
    assert.equal(out.body.local.amountMinor, 330000)
    assert.equal(h.deps.paypal.calls.create[0].amountMinor, 330000)
  } finally { h.cleanup() }
})

test("client price tampering is refused before any PayPal call", async () => {
  const pp = fakePaypal()
  const h = harness(pp)
  try {
    await assert.rejects(
      createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-2", amountMinor: 100 } }),
      (e) => e instanceof OrderError && e.status === 409 && /Price mismatch/.test(e.message)
    )
    assert.equal(pp.calls.create.length, 0)
  } finally { h.cleanup() }
})

test("a claimed amount that matches the catalog is accepted", async () => {
  const h = harness(fakePaypal())
  try {
    const out = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-3", amountMinor: 330000 } })
    assert.equal(out.body.local.amountMinor, 330000)
  } finally { h.cleanup() }
})

test("unknown product, missing price, or mixed currency fail closed", () => {
  assert.throws(() => buildQuote([{ id: "nope", qty: 1 }], [null]), /not found/)
  assert.throws(() => buildQuote([{ id: "a", qty: 1 }], [{ id: "a", price: null }]), /No fixed price/)
  assert.throws(() => buildQuote(
    [{ id: "a", qty: 1 }, { id: "b", qty: 1 }],
    [{ id: "a", price: { amountMinor: 100, currency: "USD" } }, { id: "b", price: { amountMinor: 100, currency: "NGN" } }]
  ), /Mixed currencies/)
  assert.throws(() => parseLines([{ id: "a", qty: 0 }]), /qty/)
  assert.throws(() => parseLines([]), /items needed/)
})

test("capture uses the stored server amount and refuses a different finalMinor", async () => {
  const pp = fakePaypal()
  const h = harness(pp)
  try {
    const created = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-4" } })
    const id = created.body.local.id
    await assert.rejects(
      captureStoredOrder({ deps: h.deps, tenant: "T1", orderId: id, body: { finalMinor: 1 } }),
      (e) => e.status === 409 && /Amount mismatch/.test(e.message)
    )
    assert.equal(pp.calls.capture.length, 0)
    const out = await captureStoredOrder({ deps: h.deps, tenant: "T1", orderId: id, body: {} })
    assert.equal(pp.calls.capture[0].finalMinor, 330000)
    assert.equal(out.body.local.status, "COMPLETED")
    assert.equal(out.body.local.capturedMinor, 330000)
  } finally { h.cleanup() }
})

test("after-capture check: a PayPal answer that does not verify is never marked paid", async () => {
  const pp = fakePaypal({
    getOrder: (id) => ({ id, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-9", status: "DECLINED", amount: { value: "100.00", currency_code: "NGN" } }] } }] }),
  })
  const h = harness(pp)
  try {
    const created = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-5" } })
    await assert.rejects(
      captureStoredOrder({ deps: h.deps, tenant: "T1", orderId: created.body.local.id, body: {} }),
      (e) => e instanceof OrderError && e.status === 502 && /not marked paid/i.test(e.message)
    )
    assert.equal(h.ledger.get(created.body.local.id, "T1").status, "UNVERIFIED")
  } finally { h.cleanup() }
})

test("orders are scoped per tenant key", async () => {
  const h = harness(fakePaypal())
  try {
    const created = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-6" } })
    assert.equal(h.ledger.get(created.body.local.id, "T2"), null)
    await assert.rejects(captureStoredOrder({ deps: h.deps, tenant: "T2", orderId: created.body.local.id, body: {} }), (e) => e.status === 404)
  } finally { h.cleanup() }
})

test("idempotency key is stable for the same cart and invoice, and a retry replays", async () => {
  const pp = fakePaypal()
  const h = harness(pp)
  try {
    const lines = parseLines(ITEMS)
    const k1 = idempotencyKeyFor({ tenant: "T1", storeUrl: STORE, lines, invoiceId: "INV-7" })
    const k2 = idempotencyKeyFor({ tenant: "T1", storeUrl: STORE, lines: parseLines(ITEMS), invoiceId: "INV-7" })
    assert.equal(k1, k2)
    assert.notEqual(k1, idempotencyKeyFor({ tenant: "T2", storeUrl: STORE, lines, invoiceId: "INV-7" }))
    const a = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-7" } })
    const b = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-7" } })
    assert.equal(pp.calls.create.length, 1)
    assert.equal(b.body.replay, true)
    assert.equal(a.body.local.id, b.body.local.id)
    assert.equal(pp.calls.create[0].idempotencyKey, k1)
  } finally { h.cleanup() }
})

test("orders persist across a restart", async () => {
  const h = harness(fakePaypal())
  try {
    const created = await createPricedOrder({ deps: h.deps, tenant: "T1", body: { storeUrl: STORE, items: ITEMS, invoiceId: "INV-8" } })
    const reloaded = new OrderLedger(h.path)
    assert.equal(reloaded.get(created.body.local.id, "T1").amountMinor, 330000)
  } finally { h.cleanup() }
})

test("claim check helper accepts null and rejects a drifted number", () => {
  const q = { amountMinor: 1000 }
  assertClaimMatches(undefined, q)
  assertClaimMatches(null, q)
  assert.throws(() => assertClaimMatches(999, q), /Price mismatch/)
  assert.throws(() => assertClaimMatches("1000", q), /Price mismatch/)
})
