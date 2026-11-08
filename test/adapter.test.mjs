import test from "node:test"
import assert from "node:assert/strict"
import { InMemoryStoreAdapter } from "../dist/index.js"

test("in-memory adapter lists, searches, and reads one product", async () => {
  const store = new InMemoryStoreAdapter()
  assert.equal(store.storeId, "in-memory-store")
  const all = await store.listProducts()
  assert.equal(all.length, 2)
  const found = await store.listProducts({ query: "cap" })
  assert.equal(found.length, 1)
  assert.equal(found[0].handle, "cap")
  const one = await store.getProduct("tee")
  assert.equal(one?.title, "Classic Tee")
  assert.equal(await store.getProduct("missing"), null)
  const cats = await store.listCategories()
  assert.equal(cats.length, 1)
})

test("no merchant BYOK on the public surface", async () => {
  const pub = await import("../dist/index.js")
  assert.equal(pub.groqProvider, undefined)
  assert.equal(pub.deepseekProvider, undefined)
  assert.equal(typeof pub.MachamCloudProvider, "function")
  assert.throws(() => new pub.MachamCloudProvider("bad-key", "https://api.macham.io"), /Macham API key needed/)
})

test("server providers still reject missing keys", async () => {
  const { OpenAICompatibleProvider } = await import("../dist/providers/openai-compatible.js")
  assert.throws(() => new OpenAICompatibleProvider({ name: "groq", baseUrl: "https://x", apiKey: "", model: "m" }), /API key needed/)
})
