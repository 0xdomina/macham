import test from "node:test"
import assert from "node:assert/strict"
import { MockStoreAdapter } from "../dist/index.js"

test("mock adapter lists, searches, and reads one product", async () => {
  const store = new MockStoreAdapter()
  assert.equal(store.storeId, "mock-demo-store")
  const all = await store.listProducts()
  assert.equal(all.length, 2)
  const found = await store.listProducts({ query: "cap" })
  assert.equal(found.length, 1)
  assert.equal(found[0].handle, "demo-cap")
  const one = await store.getProduct("demo-tee")
  assert.equal(one?.title, "Demo Tee")
  assert.equal(await store.getProduct("missing"), null)
  const cats = await store.listCategories()
  assert.equal(cats.length, 1)
})

test("provider constructors reject missing keys", async () => {
  const { groqProvider, deepseekProvider } = await import("../dist/index.js")
  assert.throws(() => groqProvider(""), /API key needed/)
  assert.throws(() => deepseekProvider(""), /API key needed/)
})
