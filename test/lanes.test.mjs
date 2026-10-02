import test from "node:test"
import assert from "node:assert/strict"
import { Channel3Client, toMachamProduct } from "../dist/index.js"

test("channel3 refuses without key and in browsers", () => {
  assert.throws(() => new Channel3Client(""), /API key needed/)
})

test("channel3 maps products to macham shape", () => {
  const mapped = toMachamProduct({
    id: "c3-1",
    title: "Jacket",
    images: ["https://img/1.jpg"],
    offers: [{ url: "https://shop/1", priceMinor: 5999, currency: "USD" }],
  })
  assert.equal(mapped.id, "c3-1")
  assert.equal(mapped.price.amountMinor, 5999)
  assert.equal(mapped.metadata.source, "channel3")
  const empty = toMachamProduct({ id: "c3-2", title: "X", images: [], offers: [] })
  assert.equal(empty.price, null)
})

test("channel3 validates inputs before network", async () => {
  const client = new Channel3Client("k-test")
  await assert.rejects(client.search("   "), /words needed/)
  await assert.rejects(client.lookup("  "), /URL needed/)
})
