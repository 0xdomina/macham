import test from "node:test"
import assert from "node:assert/strict"
import {
  PLANS,
  checkLimits,
  fingerprintOf,
  keyIdForLogs,
  mintKey,
  parseKey,
  verifyKey,
} from "../dist/index.js"

test("keys mint, parse, verify, and redact", () => {
  const { record, secret } = mintKey({ env: "live", scopes: { orders: true } })
  assert.match(secret, /^mch_live_[0-9a-f]+_[0-9a-f]{8}$/)
  assert.equal(record.scopes.orders, true)
  assert.equal(record.scopes.admin, false)
  const parsed = parseKey(secret)
  assert.equal(parsed.env, "live")
  assert.deepEqual(verifyKey(record, secret), { ok: true })
  assert.equal(verifyKey(record, secret + "x").ok, false)
  assert.equal(verifyKey(record, "garbage").ok, false)
  const redacted = keyIdForLogs(record)
  assert.ok(!redacted.includes(secret.slice(9, 20)))
  assert.match(redacted, /^mch_live_…[0-9a-f]{6}$/)
  assert.equal(fingerprintOf(secret).length, 16)
})

test("minted keys always re-parse (100 rounds)", () => {
  for (let i = 0; i < 100; i++) {
    const { record, secret } = mintKey({ env: i % 2 ? "live" : "test" })
    assert.ok(parseKey(secret))
    assert.deepEqual(verifyKey(record, secret), { ok: true })
  }
})

test("expiry and revocation refuse", () => {
  const { record, secret } = mintKey({ expiresInDays: 0 })
  const expired = { ...record, expiresAt: Date.now() - 1000 }
  assert.equal(verifyKey(expired, secret).ok, false)
  const revoked = { ...record, revokedAt: Date.now() }
  assert.equal(verifyKey(revoked, secret).ok, false)
})

test("plans gate by limits, null means unbounded", () => {
  assert.deepEqual(
    checkLimits(PLANS.free, { assistedSessions: 10, modelCalls: 10, seats: 1 }),
    { ok: true }
  )
  const capped = checkLimits(PLANS.free, { assistedSessions: 500, modelCalls: 10, seats: 1 })
  assert.equal(capped.ok, false)
  assert.equal(capped.metric, "assistedSessions")
  assert.deepEqual(
    checkLimits(PLANS.team, { assistedSessions: 1e9, modelCalls: 1e9, seats: 1e4 }),
    { ok: true }
  )
})
