import test from "node:test"
import assert from "node:assert/strict"
import { UniversalAdapter } from "../dist/index.js"

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function shopifyFetch() {
  return async (url, init) => {
    const u = String(url)
    if (u.endsWith("/api/2026-07/graphql.json")) {
      const query = JSON.parse(String(init?.body ?? "{}")).query ?? ""
      if (query.includes("{ shop { name } }")) return json({ data: { shop: { name: "Probe Store" } } })
      if (query.includes("collections(")) {
        return json({ data: { collections: { nodes: [{ id: "1", title: "Coats", handle: "coats" }] } } })
      }
      return json({
        data: {
          products: {
            nodes: [
              { id: "gid://1", title: "Harbor Parka", handle: "harbor-parka", description: "Warm.", featuredImage: { url: "https://x/img.jpg" }, priceRange: { minVariantPrice: { amount: "42.00", currencyCode: "USD" } } },
            ],
          },
          search: { nodes: [] },
        },
      })
    }
    if (u.includes("/products/harbor-parka.js")) {
      return json({ id: 9, title: "Harbor Parka", handle: "harbor-parka", description: "<p>Warm.</p>", price_min: 4200, featured_image: "https://x/img.jpg" })
    }
    return new Response("no", { status: 404 })
  }
}

test("shopify lane detects, lists, reads, categorizes", async () => {
  const store = new UniversalAdapter("https://probe.example", shopifyFetch())
  assert.equal(await store.detect(), "shopify")
  assert.equal(store.storeId, "probe.example")
  const list = await store.listProducts({ limit: 5 })
  assert.equal(list.length, 1)
  assert.equal(list[0].title, "Harbor Parka")
  assert.deepEqual(list[0].price, { amountMinor: 4200, currency: "USD" })
  const one = await store.getProduct("harbor-parka")
  assert.equal(one?.handle, "harbor-parka")
  assert.equal(await store.getProduct("missing"), null)
  assert.deepEqual(await store.listCategories(), [{ id: "coats", name: "Coats" }])
})

function wooFetch() {
  const product = {
    id: 34,
    name: "WordPress Pennant",
    slug: "pennant",
    short_description: "<p>Flag.</p>",
    images: [{ src: "https://x/flag.jpg" }],
    prices: { price: "2500", currency_code: "USD" },
  }
  return async (url) => {
    const u = String(url)
    if (u.includes("/products/categories")) return json([{ id: 3, slug: "flags", name: "Flags" }])
    if (u.includes("/products/34")) return json(product)
    if (u.includes("/products?slug=")) return json([product])
    if (u.includes("/products")) return json([product])
    return new Response("no", { status: 404 })
  }
}

test("woo lane detects, lists, reads by id and slug", async () => {
  const store = new UniversalAdapter("https://woo.example/shop/", wooFetch())
  assert.equal(await store.detect(), "woo")
  assert.equal(store.storeId, "woo.example")
  const list = await store.listProducts({ query: "pennant" })
  assert.equal(list[0].price?.amountMinor, 2500)
  assert.equal((await store.getProduct("34"))?.handle, "pennant")
  assert.equal((await store.getProduct("pennant"))?.title, "WordPress Pennant")
  assert.deepEqual(await store.listCategories(), [{ id: "flags", name: "Flags" }])
})

const SITEMAP = `<?xml version="1.0"?><urlset><url><loc>https://plain.example/products/trail-shell</loc></url><url><loc>https://plain.example/about</loc></url></urlset>`
const PAGE = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Trail Shell","image":"https://plain.example/shell.jpg","description":"Light shell.","offers":{"@type":"Offer","price":"46.50","priceCurrency":"USD","url":"https://plain.example/products/trail-shell"}}</script></head></html>`

function jsonldFetch() {
  return async (url, init) => {
    const u = String(url)
    if (u.endsWith("/api/2026-07/graphql.json")) return new Response("no", { status: 404 })
    if (u.includes("/wp-json/")) return new Response("no", { status: 404 })
    if (u.endsWith("/sitemap.xml")) return new Response(SITEMAP, { status: 200, headers: { "content-type": "application/xml" } })
    if (u.includes("/products/")) return new Response(PAGE, { status: 200, headers: { "content-type": "text/html" } })
    return new Response("no", { status: 404 })
  }
}

test("jsonld lane falls through, lists, filters, reads", async () => {
  const store = new UniversalAdapter("https://plain.example", jsonldFetch())
  assert.equal(await store.detect(), "jsonld")
  const all = await store.listProducts({ limit: 10 })
  assert.equal(all.length, 1)
  assert.deepEqual(all[0].price, { amountMinor: 4650, currency: "USD" })
  assert.equal((await store.listProducts({ query: "nomatchword" })).length, 0)
  assert.equal((await store.getProduct("trail-shell"))?.title, "Trail Shell")
  assert.deepEqual(await store.listCategories(), [])
})

test("unreadable store fails closed, bad url refuses", async () => {
  const dead = async () => new Response("no", { status: 404 })
  const store = new UniversalAdapter("https://dead.example", dead)
  assert.equal(await store.detect(), null)
  await assert.rejects(() => store.listProducts(), /Store not readable/)
  assert.throws(() => new UniversalAdapter("not a url"), /Store URL needed/)
})
