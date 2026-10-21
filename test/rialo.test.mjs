import test from "node:test"
import assert from "node:assert/strict"
import { appendAuditEvent, decodeAuditMemo, isRialoAuditConfigured, readAuditEvents } from "../dist/settlement/rialo.js"

function withEnv(vars, fn) {
  const saved = {}
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(vars)) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
    })
}

const DISABLED = {
  RIALO_AUDIT_ENABLED: undefined,
  RIALO_AUDIT_KEY: undefined,
  RIALO_AUDIT_ADDRESS: undefined,
  RIALO_RPC_URL: undefined,
}

test("disabled by default: append returns null, read returns []", async () => {
  await withEnv(DISABLED, async () => {
    assert.equal(isRialoAuditConfigured(), false)
    assert.equal(
      await appendAuditEvent({ kind: "quote-accepted", ref: "Q-1" }),
      null
    )
    assert.deepEqual(await readAuditEvents("Q-1"), [])
  })
})

test("enabled without a key still fails closed", async () => {
  await withEnv({ ...DISABLED, RIALO_AUDIT_ENABLED: "true" }, async () => {
    assert.equal(isRialoAuditConfigured(), false)
    assert.equal(
      await appendAuditEvent({ kind: "quote-accepted", ref: "Q-1" }),
      null
    )
    assert.deepEqual(await readAuditEvents("Q-1"), [])
  })
})

test("event-shape validation rejects bad input without throwing", async () => {
  await withEnv(DISABLED, async () => {
    const bad = [
      undefined,
      null,
      {},
      { kind: "", ref: "Q-1" },
      { kind: "quote accepted!", ref: "Q-1" },
      { kind: "quote-accepted", ref: "" },
      { kind: "quote-accepted", ref: "   " },
      { kind: "quote-accepted", ref: "Q-1", actor: 42 },
      { kind: "quote-accepted", ref: "Q-1", payload: [1, 2] },
      { kind: "quote-accepted", ref: "Q-1", payload: "nope" },
    ]
    for (const input of bad) {
      assert.equal(await appendAuditEvent(input), null)
    }
    assert.deepEqual(await readAuditEvents(""), [])
    assert.deepEqual(await readAuditEvents("   "), [])
    assert.deepEqual(await readAuditEvents(undefined), [])
  })
})

test("memo decoder reads base58, falls back to base64, refuses garbage", async () => {
  assert.equal(decodeAuditMemo("AYJnJj3pnyHaH1uzTWc3wr"), 'MACHAM/1:{"v":1}')
  assert.equal(decodeAuditMemo("TUFDSEFNLzE6eyJ2IjoxfQ=="), 'MACHAM/1:{"v":1}')
  assert.equal(decodeAuditMemo(""), null)
  assert.equal(decodeAuditMemo(null), null)
  assert.equal(decodeAuditMemo("0OIl"), null)
})

test("oversized ref fails closed without network use", async () => {
  await withEnv(DISABLED, async () => {
    assert.equal(
      await appendAuditEvent({ kind: "quote-accepted", ref: "r".repeat(500) }),
      null
    )
    assert.deepEqual(await readAuditEvents("r".repeat(500)), [])
  })
})
