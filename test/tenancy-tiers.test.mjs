import test from "node:test"
import assert from "node:assert/strict"
import {
  MemoryTenantStore,
  TierRegistry,
  tenantIdOf,
} from "../dist/index.js"

const A = { tenantId: "platform-a", actorId: "buyer-1" }
const B = { tenantId: "platform-b", actorId: "buyer-9" }

test("tenant ids validate and stores namespace", async () => {
  assert.equal(tenantIdOf(A), "platform-a")
  assert.throws(() => tenantIdOf({ tenantId: "" }), /Tenant needed/)
  assert.throws(() => tenantIdOf({ tenantId: "has space" }), /Tenant needed/)
  const store = new MemoryTenantStore()
  await store.set("platform-a", "k", "va")
  assert.equal(await store.get("platform-a", "k"), "va")
  assert.equal(await store.get("platform-b", "k"), null)
  await store.del("platform-a", "k")
  assert.equal(await store.get("platform-a", "k"), null)
})

test("tiers price by break table", () => {
  const reg = new TierRegistry()
  reg.set(A, {
    sku: "WIDGET",
    minQty: 10,
    currency: "NGN",
    tiers: [
      { minQty: 10, unitMinor: 2000 },
      { minQty: 100, unitMinor: 1800 },
      { minQty: 500, unitMinor: 1500 },
    ],
  })
  assert.deepEqual(reg.price(A, "widget", 50), {
    ok: true, unitMinor: 2000, tierMinQty: 10, currency: "NGN",
  })
  assert.deepEqual(reg.price(A, "WIDGET", 500), {
    ok: true, unitMinor: 1500, tierMinQty: 500, currency: "NGN",
  })
  const low = reg.price(A, "WIDGET", 5)
  assert.equal(low.ok, false)
  assert.equal(low.reason, "below_minimum")
  const missing = reg.price(A, "NOPE", 50)
  assert.equal(missing.reason, "no_table")
})

test("platform B never sees platform A tables", () => {
  const reg = new TierRegistry()
  reg.set(A, {
    sku: "SECRET-SKU",
    minQty: 1,
    currency: "NGN",
    tiers: [{ minQty: 1, unitMinor: 999 }],
  })
  assert.equal(reg.get(B, "SECRET-SKU"), null)
  const priced = reg.price(B, "SECRET-SKU", 100)
  assert.equal(priced.ok, false)
  assert.equal(priced.reason, "no_table")
})

test("tables reject margin-breaking shapes", () => {
  const reg = new TierRegistry()
  assert.throws(
    () => reg.set(A, { sku: "X", minQty: 1, currency: "NGN", tiers: [] }),
    /Tiers needed/
  )
  assert.throws(
    () =>
      reg.set(A, {
        sku: "X", minQty: 1, currency: "NGN",
        tiers: [
          { minQty: 10, unitMinor: 100 },
          { minQty: 100, unitMinor: 200 },
        ],
      }),
    /never more/
  )
})

test("router stickiness is per tenant", async () => {
  const { MockProvider, ProviderRouter } = await import("../dist/index.js")
  const flaky = new MockProvider("flaky", {}, true)
  const steady = new MockProvider("steady", { hi: "yo" })
  const router = new ProviderRouter({ providers: [flaky, steady] })
  const a = await router.chat([{ role: "user", content: "hi" }], { tenantId: "platform-a" })
  assert.equal(a.text, "yo")
  const b = await router.chat([{ role: "user", content: "hi" }], { tenantId: "platform-b" })
  assert.equal(b.text, "yo")
})

test("harness requires a tenant", async () => {
  const { Harness, MockProvider } = await import("../dist/index.js")
  assert.throws(
    () => new Harness({ brain: new MockProvider(), capabilities: [], tenantId: "" }),
    /Tenant needed/
  )
  const h = new Harness({ brain: new MockProvider(), capabilities: [], tenantId: "platform-a" })
  assert.equal(h.tenantId, "platform-a")
})
