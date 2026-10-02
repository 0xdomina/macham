import test from "node:test"
import assert from "node:assert/strict"
import { GuardrailStore, judge } from "../dist/index.js"

const A = { tenantId: "platform-a", actorId: "seller-1" }
const B = { tenantId: "platform-b" }

const base = { sku: "W", listUnitMinor: 1000, quantity: 10 }

test("auto passes inside caps, approves above", () => {
  const store = new GuardrailStore()
  store.setPolicy(A, { maxAutoDiscountPct: 10, approvalAboveMinor: 50_000 })
  const small = store.decide(A, { ...base, proposedUnitMinor: 950 })
  assert.equal(small.verdict.ok, true)
  assert.equal(small.verdict.auto, true)
  const big = store.decide(A, { ...base, quantity: 100, proposedUnitMinor: 950 })
  assert.equal(big.verdict.auto, false)
  assert.equal(big.verdict.needsApproval, "approver")
  const deep = store.decide(A, { ...base, proposedUnitMinor: 500 })
  assert.equal(deep.verdict.auto, false)
})

test("floors and MAP deny absolutely", () => {
  const store = new GuardrailStore()
  store.setPolicy(A, { costFloorMinor: 700, mapFloorsMinor: { Acme: 800 } })
  const underCost = store.decide(A, { ...base, brand: "Acme", proposedUnitMinor: 600 })
  assert.equal(underCost.verdict.ok, false)
  const underMap = store.decide(A, { ...base, brand: "Acme", proposedUnitMinor: 750 })
  assert.equal(underMap.verdict.ok, false)
  const fine = store.decide(A, { ...base, brand: "Acme", proposedUnitMinor: 900 })
  assert.equal(fine.verdict.ok, true)
})

test("defaults deny-safe with no policy", () => {
  const v = judge(B, {}, { ...base, proposedUnitMinor: 500 })
  assert.equal(v.ok, true)
  assert.equal(v.auto, false)
})

test("audit trail stays tenant-scoped", () => {
  const store = new GuardrailStore()
  store.setPolicy(A, {})
  store.decide(A, { ...base, proposedUnitMinor: 900 })
  assert.equal(store.trail(A).length, 1)
  assert.equal(store.trail(A)[0].tenantId, "platform-a")
  assert.deepEqual(store.trail(B), [])
})

test("bad policies and proposals refuse", () => {
  const store = new GuardrailStore()
  assert.throws(() => store.setPolicy(A, { maxAutoDiscountPct: 150 }), /0 to 100/)
  const bad = store.decide(A, { ...base, proposedUnitMinor: -5 })
  assert.equal(bad.verdict.ok, false)
})
