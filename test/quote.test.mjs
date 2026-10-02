import test from "node:test"
import assert from "node:assert/strict"
import {
  QuoteRegistry,
  acceptPresented,
  createRequest,
  presentCounter,
  sweepExpired,
} from "../dist/index.js"

const A = { tenantId: "platform-a" }
const B = { tenantId: "platform-b" }

test("request lifecycle: draft to accepted", () => {
  const reg = new QuoteRegistry()
  const req = createRequest(A, { sku: "WIDGET", quantity: 100 })
  assert.equal(req.state, "draft")
  assert.equal(req.rounds, 0)
  reg.put(A, req)
  const presented = presentCounter(req, { unitMinor: 1800, minQty: 100, leadDays: 7 })
  assert.equal(presented.ok, true)
  assert.equal(presented.request.rounds, 1)
  reg.put(A, presented.request)
  const done = acceptPresented(presented.request)
  assert.equal(done.ok, true)
  assert.equal(done.request.state, "accepted")
})

test("floor refuses, rounds cap, expiry closes", () => {
  const req = createRequest(A, { sku: "W", quantity: 10, ttlHours: 1 })
  const cheap = presentCounter(req, { unitMinor: 5, minQty: 10 }, { floorMinor: 100 })
  assert.equal(cheap.ok, false)
  let cur = req
  for (let i = 0; i < 5; i++) {
    const r = presentCounter(cur, { unitMinor: 200, minQty: 10 })
    assert.equal(r.ok, true)
    cur = { ...r.request, state: "draft" }
  }
  const sixth = presentCounter(cur, { unitMinor: 200, minQty: 10 })
  assert.equal(sixth.ok, false)
  assert.equal(sixth.reason, "No rounds left.")
  const stale = sweepExpired({ ...req, state: "presented", expiresAt: Date.now() - 1 })
  assert.equal(stale.state, "expired")
  assert.equal(acceptPresented(stale).ok, false)
})

test("invalid requests refuse", () => {
  assert.throws(() => createRequest(A, { sku: "", quantity: 1 }), /SKU needed/)
  assert.throws(() => createRequest(A, { sku: "X", quantity: 0 }), /Quantity/)
  assert.throws(() => createRequest(A, { sku: "X", quantity: 1, ttlHours: 500 }), /14 days/)
})

test("quotes never cross tenants", () => {
  const reg = new QuoteRegistry()
  const req = createRequest(A, { sku: "W", quantity: 5 })
  reg.put(A, req)
  assert.equal(reg.get(B, req.id), null)
  assert.deepEqual(reg.list(B), [])
  assert.equal(reg.list(A).length, 1)
})
