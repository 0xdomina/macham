import test from "node:test"
import assert from "node:assert/strict"
import { kernelLaneFactory } from "../dist/index.js"
import { ElasticCatalog } from "../dist/index.js"
import { productsFromJsonLdText } from "../dist/index.js"

function kernelFetch() {
  const seen = []
  return {
    seen,
    run: async (url, init) => {
      seen.push([String(init?.method ?? "GET"), String(url)])
      const u = String(url)
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (u === "https://api.onkernel.com/browsers" && init?.method === "POST") {
        return Response.json({ session_id: "sess_1" })
      }
      if (u.includes("/playwright/execute")) {
        if (body.code?.includes("ld+json")) return Response.json({ success: true, result: "[]" })
        return Response.json({ success: true, result: "https://shop.example/p" })
      }
      if (u.endsWith("/browsers/sess_1") && init?.method === "DELETE") return Response.json({})
      return new Response("no", { status: 404 })
    },
  }
}

test("kernel lane opens, extracts, refuses writes, closes", async () => {
  const fake = kernelFetch()
  const open = kernelLaneFactory("k_test", fake.run)
  const lane = await open({ url: "https://shop.example/p" })
  assert.equal(lane.name, "kernel")
  assert.deepEqual(await lane.goto("https://shop.example/p"), { ok: true })
  const got = await lane.act({ kind: "extract", target: "jsonld", schema: "product" })
  assert.equal(got.ok, true)
  assert.deepEqual(await lane.act({ kind: "click", target: "buy" }), { ok: false, reason: "Read-only lane." })
  await lane.close()
  assert.ok(fake.seen.some(([m, u]) => m === "DELETE" && u.endsWith("/browsers/sess_1")))
  assert.throws(() => kernelLaneFactory(""), /Kernel key needed/)
})

test("kernel JSON-LD text maps to products: pretty, multi-doc, @graph, dedupe", () => {
  const pretty = `{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "Harbor Parka",\n  "image": "https://x/a.jpg",\n  "offers": { "@type": "Offer", "price": "199.5", "priceCurrency": "EUR" }\n}`
  // A second, separate document joined by a newline, plus a @graph list, plus junk.
  const graph = `{"@graph":[{"@type":"Product","name":"Trail Runner","offers":[{"price":42,"priceCurrency":"USD"}]},{"@type":"Product","name":"Trail Runner"},{"@type":"WebSite","name":"not a product"}]}`
  const text = `${pretty}\n${graph}\n{ this is not valid json }`
  const out = productsFromJsonLdText(text, "https://shop.example/harbor-parka")
  const titles = out.map((p) => p.title).sort()
  assert.deepEqual(titles, ["Harbor Parka", "Trail Runner"], "dedupes by title and ignores non-products/junk")
  const parka = out.find((p) => p.title === "Harbor Parka")
  assert.deepEqual(parka.price, { amountMinor: 19950, currency: "EUR" })
  assert.equal(parka.imageUrl, "https://x/a.jpg")
  assert.equal(parka.metadata.source, "jsonld")
  const runner = out.find((p) => p.title === "Trail Runner")
  assert.deepEqual(runner.price, { amountMinor: 4200, currency: "USD" })
  // Empty / non-string inputs are safe.
  assert.deepEqual(productsFromJsonLdText("", "https://x"), [])
  assert.deepEqual(productsFromJsonLdText("[]", "https://x"), [])
})

function elasticFetch() {
  const seen = []
  return {
    seen,
    run: async (url, init) => {
      seen.push([String(init?.method ?? "GET"), String(url)])
      const u = String(url)
      if (u.endsWith("/macham-products") && init?.method === "PUT") return Response.json({ acknowledged: true })
      if (u.endsWith("/_bulk")) {
        return Response.json({ errors: false, items: [{ index: {} }, { index: {} }] })
      }
      if (u.endsWith("/macham-products/_search")) {
        return Response.json({
          hits: {
            hits: [
              { _id: "p1", _source: { title: "Harbor Parka", handle: "harbor-parka", imageUrl: "https://x/i.jpg", amountMinor: 4200, currency: "USD" } },
            ],
          },
        })
      }
      return new Response("no", { status: 404 })
    },
  }
}

test("elastic lane maps, ranks BM25, upgrades to hybrid with vectors", async () => {
  const fake = elasticFetch()
  const cat = new ElasticCatalog("https://elastic.example", "ek_test", fake.run)
  assert.equal(await cat.ensureIndex(), true)
  assert.equal(await cat.index([{ id: "p1", title: "Harbor Parka" }, { id: "", title: "" }]), 2)
  const rows = await cat.search("parka")
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].price, { amountMinor: 4200, currency: "USD" })
  assert.equal(rows[0].metadata.source, "elastic")
  const hybrid = await cat.search("parka", { queryEmbedding: [0.1, 0.2] })
  assert.equal(hybrid.length, 1)
  assert.ok(fake.seen.some(([m, u]) => m === "POST" && u.endsWith("/_search")))
  await assert.rejects(() => cat.search(""), /Search words needed/)
  assert.throws(() => new ElasticCatalog("", "k"), /Elastic URL needed/)
  assert.throws(() => new ElasticCatalog("https://x", ""), /Elastic key needed/)
})
