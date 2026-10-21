import test from "node:test"
import assert from "node:assert/strict"
import {
  settlementNetwork,
  settlementWritesEnabled,
  anchorSettlement,
  readSettlementAudit,
  anchorEventFromBody,
} from "../server/audit.mjs"

function withEnv(vars, fn) {
  const saved = {}
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(vars)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })
}

const OFF = {
  RIALO_AUDIT_ENABLED: undefined,
  RIALO_AUDIT_KEY: undefined,
  RIALO_AUDIT_ADDRESS: undefined,
  RIALO_NETWORK: undefined,
}

test("network defaults to testnet, honours devnet", async () => {
  await withEnv({ ...OFF, RIALO_NETWORK: "devnet" }, () => assert.equal(settlementNetwork(), "devnet"))
  await withEnv(OFF, () => assert.equal(settlementNetwork(), "testnet"))
})

test("disabled: writes not configured, anchor fails closed, read empty", async () => {
  await withEnv(OFF, async () => {
    assert.equal(settlementWritesEnabled(), false)
    const a = await anchorSettlement({ kind: "paypal-captured", ref: "ORDER-1" })
    assert.deepEqual(a, { enabled: false, anchored: false, signature: null })
    const r = await readSettlementAudit("ORDER-1")
    assert.equal(r.network, "testnet")
    assert.deepEqual(r.events, [])
  })
})

test("enabled without a key still fails closed", async () => {
  await withEnv({ ...OFF, RIALO_AUDIT_ENABLED: "true" }, async () => {
    assert.equal(settlementWritesEnabled(), false)
    const a = await anchorSettlement({ kind: "paypal-captured", ref: "ORDER-2" })
    assert.equal(a.anchored, false)
    assert.equal(a.signature, null)
  })
})

test("body shaper slices and drops non-object payloads", () => {
  const e = anchorEventFromBody({
    kind: "x".repeat(200),
    ref: "r".repeat(300),
    actor: 42,
    payload: [1, 2, 3],
  })
  assert.equal(e.kind.length, 64)
  assert.equal(e.ref.length, 160)
  assert.equal("actor" in e, false, "non-string actor dropped")
  assert.equal("payload" in e, false, "array payload dropped")
  const ok = anchorEventFromBody({ kind: "k", ref: "R", payload: { a: 1 } })
  assert.deepEqual(ok.payload, { a: 1 })
})

test("body shaper survives junk input", () => {
  for (const junk of [undefined, null, "str", 123, []]) {
    const e = anchorEventFromBody(junk)
    assert.equal(e.kind, "")
    assert.equal(e.ref, "")
  }
})
