import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MemoryKeyStore, FileKeyStore, currentMonth } from "../dist/auth/keystore.js"
import { mintKey } from "../dist/auth/keys.js"
import { RateLimiter } from "../dist/auth/ratelimit.js"

function fresh() {
  const { record } = mintKey({ env: "test" })
  return record
}

test("memory store saves, finds, revokes, meters", async () => {
  const store = new MemoryKeyStore()
  const record = fresh()
  store.save(record)
  assert.deepEqual(store.findByFingerprint(record.fingerprint)?.id, record.id)
  assert.equal(store.findByFingerprint("nope"), null)
  const month = currentMonth()
  assert.deepEqual(store.getUsage(record.fingerprint, month), { month, sessions: 0, modelCalls: 0 })
  assert.deepEqual(store.addUsage(record.fingerprint, month, { sessions: 1, modelCalls: 2 }), { month, sessions: 1, modelCalls: 2 })
  assert.equal(store.addUsage("nope", month, { sessions: 1 }), null)
  assert.equal(store.revoke(record.fingerprint), true)
  assert.equal(store.revoke("nope"), false)
})

test("file store round-trips records and usage", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "mch-")), "keys.json")
  const month = currentMonth()
  {
    const store = new FileKeyStore(path)
    const record = fresh()
    store.save(record)
    store.addUsage(record.fingerprint, month, { sessions: 3 })
  }
  const reopened = new FileKeyStore(path)
  assert.equal(reopened.list().length, 1)
  assert.deepEqual(reopened.getUsage(reopened.list()[0].fingerprint, month), { month, sessions: 3, modelCalls: 0 })
})

test("corrupt file store starts empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mch-"))
  const { writeFileSync } = await import("node:fs")
  const path = join(dir, "keys.json")
  writeFileSync(path, "{broken")
  assert.deepEqual(new FileKeyStore(path).list(), [])
})

test("rate limiter caps the window then releases", async () => {
  const limiter = new RateLimiter(2, 60_000)
  assert.equal(limiter.take("k", 1000), true)
  assert.equal(limiter.take("k", 1001), true)
  assert.equal(limiter.take("k", 1002), false)
  assert.equal(limiter.take("other", 1002), true)
  assert.equal(limiter.take("k", 1000 + 61_000), true)
})
