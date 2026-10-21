import type { Category, Product } from "../types.js"
import type { StoreAdapter } from "./types.js"

// UniversalAdapter: zero-code store connection. Paste a store URL. No keys,
// no afternoon of adapter code. Detection order: Shopify tokenless
// Storefront GraphQL → Woo Store API → sitemap plus JSON-LD. Every lane is
// a public read-only endpoint. Nothing here buys, logs in, or writes.
// Fail-closed with short messages. Server-side recommended: store CORS
// policies may block browsers. The gateway resolve route hosts this lane.

export type UniversalPlatform = "shopify" | "woo" | "jsonld"

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export class UniversalAdapter implements StoreAdapter {
  readonly storeId: string
  private readonly base: string
  private readonly fetch: Fetcher
  private readonly timeoutMs: number
  private platform: UniversalPlatform | null | undefined

  constructor(storeUrl: string, fetcher: Fetcher = fetch, opts?: { timeoutMs?: number }) {
    const base = (storeUrl ?? "").trim().replace(/\/$/, "")
    if (!/^https?:\/\/[^/]+$/.test(base) && !/^https?:\/\/[^/]+\//.test(base)) {
      throw new Error("Store URL needed.")
    }
    try {
      const url = new URL(base)
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error()
      this.base = `${url.protocol}//${url.host}`
    } catch {
      throw new Error("Store URL needed.")
    }
    this.storeId = this.base.replace(/^https?:\/\//, "").replace(/^www\./, "")
    this.fetch = fetcher
    this.timeoutMs = opts?.timeoutMs ?? 15_000
  }

  /** Detected lane, cached. Null when the store reads nothing public. */
  async detect(): Promise<UniversalPlatform | null> {
    if (this.platform !== undefined) return this.platform
    this.platform = (await this.probeShopify()) ? "shopify" : (await this.probeWoo()) ? "woo" : (await this.probeSitemap()) ? "jsonld" : null
    return this.platform
  }

  async listProducts(input?: { limit?: number; query?: string; categoryId?: string }): Promise<Product[]> {
    const platform = await this.detect()
    if (!platform) throw new Error("Store not readable.")
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 30)
    if (platform === "shopify") return this.shopifyList(input?.query, limit)
    if (platform === "woo") return this.wooList(input?.query, input?.categoryId, limit)
    return this.jsonldList(input?.query, limit)
  }

  async getProduct(idOrHandle: string): Promise<Product | null> {
    const platform = await this.detect()
    if (!platform) throw new Error("Store not readable.")
    const key = (idOrHandle ?? "").trim()
    if (!key) return null
    if (platform === "shopify") return this.shopifyGet(key)
    if (platform === "woo") return this.wooGet(key)
    return this.jsonldGet(key)
  }

  async listCategories(): Promise<Category[]> {
    const platform = await this.detect()
    if (!platform) throw new Error("Store not readable.")
    try {
      if (platform === "shopify") {
        const data = await this.graphql<{ collections: { nodes: { id: string; title: string; handle: string }[] } }>(
          `{ collections(first: 10) { nodes { id title handle } } }`
        )
        return (data.collections?.nodes ?? []).map((c) => ({ id: c.handle || c.id, name: c.title })).filter((c) => c.name)
      }
      if (platform === "woo") {
        const rows = await this.getJson<any[]>(`/wp-json/wc/store/v1/products/categories?per_page=20`)
        return (Array.isArray(rows) ? rows : []).map((c) => ({ id: String(c.slug ?? c.id), name: String(c.name ?? "") })).filter((c) => c.name)
      }
    } catch {
      // Categories are a nicety. Empty beats an error.
    }
    return []
  }

  // Probes (cheap, single round trip each)

  private async probeShopify(): Promise<boolean> {
    try {
      const data = await this.graphql<{ shop: { name: string } }>(`{ shop { name } }`)
      return Boolean(data.shop?.name)
    } catch {
      return false
    }
  }

  private async probeWoo(): Promise<boolean> {
    try {
      const rows = await this.getJson<unknown>(`/wp-json/wc/store/v1/products?per_page=1`)
      return Array.isArray(rows)
    } catch {
      return false
    }
  }

  private async probeSitemap(): Promise<boolean> {
    try {
      const urls = await this.sitemapUrls()
      return urls.length > 0
    } catch {
      return false
    }
  }

  // Shopify lane (tokenless Storefront GraphQL + Ajax product JSON)

  private async graphql<T>(query: string): Promise<T> {
    const res = await this.fetch(`${this.base}/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error("Store unreachable.")
    const body = (await res.json()) as { data?: T; errors?: unknown[] }
    if (!body.data || body.errors?.length) throw new Error("Store not readable.")
    return body.data
  }

  private async shopifyList(query: string | undefined, limit: number): Promise<Product[]> {
    const q = (query ?? "").trim().replace(/["\\]/g, " ")
    const data = await this.graphql<{
      products: { nodes: Record<string, any>[] }
      search?: { nodes: Record<string, any>[] }
    }>(
      q
        ? `{ search(first: ${limit}, query: "${q.slice(0, 60)}", types: PRODUCT) { nodes { ... on Product { id title handle description featuredImage { url } priceRange { minVariantPrice { amount currencyCode } } } } } }`
        : `{ products(first: ${limit}) { nodes { id title handle description featuredImage { url } priceRange { minVariantPrice { amount currencyCode } } } } }`
    )
    const nodes = q ? data.search?.nodes ?? [] : data.products?.nodes ?? []
    return nodes.map((n) => this.shopifyNode(n)).filter((p): p is Product => p !== null)
  }

  private shopifyNode(n: Record<string, any>): Product | null {
    const title = String(n.title ?? "").trim()
    if (!title) return null
    const price = n.priceRange?.minVariantPrice
    const major = Number(price?.amount ?? NaN)
    const handle = n.handle ? String(n.handle) : undefined
    return {
      id: String(n.id ?? n.handle ?? title),
      title,
      handle,
      description: n.description ? String(n.description).slice(0, 500) : undefined,
      imageUrl: n.featuredImage?.url ? String(n.featuredImage.url) : null,
      price: Number.isFinite(major)
        ? { amountMinor: Math.round(major * 100), currency: String(price.currencyCode ?? "USD") }
        : null,
      metadata: { source: "shopify", url: handle ? `${this.base}/products/${handle}` : undefined },
    }
  }

  private async shopifyGet(handle: string): Promise<Product | null> {
    const slug = handle.split("/").filter(Boolean).pop() ?? handle
    try {
      const res = await this.fetch(`${this.base}/products/${encodeURIComponent(slug)}.js`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok) return null
      const raw = (await res.json()) as Record<string, any>
      if (!raw.title) return null
      const cents = Number(raw.price_min ?? raw.price ?? NaN)
      return {
        id: String(raw.id ?? slug),
        title: String(raw.title),
        handle: String(raw.handle ?? slug),
        description: raw.description ? String(raw.description).replace(/<[^>]*>/g, " ").slice(0, 500).trim() : undefined,
        imageUrl: raw.featured_image ?? null,
        price: Number.isFinite(cents) ? { amountMinor: Math.round(cents), currency: "USD" } : null,
        metadata: { source: "shopify" },
      }
    } catch {
      return null
    }
  }

  // Woo lane (public Store API)

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(this.timeoutMs) })
    if (!res.ok) throw new Error("Store unreachable.")
    return (await res.json()) as T
  }

  private wooMap(raw: Record<string, any>): Product | null {
    const title = String(raw.name ?? "").trim()
    if (!title) return null
    const minor = Number(raw.prices?.price ?? NaN)
    const images = Array.isArray(raw.images) ? raw.images.map((i: any) => i?.src).filter((u: unknown) => typeof u === "string") : []
    return {
      id: String(raw.id ?? raw.slug ?? title),
      title,
      handle: raw.slug ? String(raw.slug) : undefined,
      description: raw.short_description ? String(raw.short_description).replace(/<[^>]*>/g, " ").slice(0, 500).trim() : undefined,
      imageUrl: images[0] ?? null,
      price: Number.isFinite(minor) ? { amountMinor: Math.round(minor), currency: String(raw.prices?.currency_code ?? "USD") } : null,
      metadata: { source: "woo", url: raw.permalink ? String(raw.permalink) : undefined },
    }
  }

  private async wooList(query: string | undefined, categoryId: string | undefined, limit: number): Promise<Product[]> {
    const params = new URLSearchParams({ per_page: String(limit) })
    if (query?.trim()) params.set("search", query.trim().slice(0, 60))
    if (categoryId?.trim()) params.set("category", categoryId.trim())
    const rows = await this.getJson<Record<string, any>[]>(`/wp-json/wc/store/v1/products?${params}`)
    return (Array.isArray(rows) ? rows : []).map((r) => this.wooMap(r)).filter((p): p is Product => p !== null)
  }

  private async wooGet(key: string): Promise<Product | null> {
    const tryPaths = /^\d+$/.test(key)
      ? [`/wp-json/wc/store/v1/products/${key}`]
      : [`/wp-json/wc/store/v1/products?slug=${encodeURIComponent(key)}`]
    for (const path of tryPaths) {
      try {
        const raw = await this.getJson<any>(path)
        const row = Array.isArray(raw) ? raw[0] : raw
        if (row) {
          const mapped = this.wooMap(row)
          if (mapped) return mapped
        }
      } catch {
        continue
      }
    }
    return null
  }

  // JSON-LD lane (sitemap enumeration plus schema.org Product blocks)

  private async sitemapUrls(): Promise<string[]> {
    const locs = await this.collectLocs(`${this.base}/sitemap.xml`, 0)
    const productish = locs.filter((u) => /\/products?\//.test(u) && !/\.xml$/i.test(u))
    if (productish.length) return [...new Set(productish)].slice(0, 30)
    return []
  }

  private async collectLocs(url: string, depth: number): Promise<string[]> {
    if (depth > 1) return []
    const res = await this.fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
    if (!res.ok) throw new Error("Store unreachable.")
    const xml = await res.text()
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean)
    const nested = locs.filter((u) => /\.xml(\?|$)/i.test(u)).slice(0, 3)
    if (!nested.length) return locs
    const out: string[] = []
    for (const child of nested) {
      try {
        out.push(...(await this.collectLocs(child, depth + 1)))
      } catch {
        continue
      }
    }
    return out
  }

  private async fetchJsonLd(url: string): Promise<Record<string, any> | null> {
    try {
      const res = await this.fetch(url, {
        headers: { accept: "text/html" },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok) return null
      const html = await res.text()
      if (html.length > 2_000_000) return null
      for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
          const parsed: any = JSON.parse(m[1])
          const found = this.findProduct(parsed)
          if (found) return found
        } catch {
          continue
        }
      }
    } catch {
      // One bad page never sinks the lane.
    }
    return null
  }

  private findProduct(node: any): Record<string, any> | null {
    if (!node || typeof node !== "object") return null
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = this.findProduct(entry)
        if (found) return found
      }
      return null
    }
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]
    if (types.includes("Product")) return node
    if (node["@graph"]) return this.findProduct(node["@graph"])
    return null
  }

  private jsonldMap(raw: Record<string, any>, url: string): Product | null {
    const title = String(raw.name ?? "").trim()
    if (!title) return null
    const offers = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers
    const major = Number(offers?.price ?? NaN)
    const image = Array.isArray(raw.image) ? raw.image[0] : raw.image
    return {
      id: url,
      title,
      handle: undefined,
      description: raw.description ? String(raw.description).slice(0, 500) : undefined,
      imageUrl: typeof image === "string" ? image : (image?.url ?? null),
      price: Number.isFinite(major)
        ? { amountMinor: Math.round(major * 100), currency: String(offers?.priceCurrency ?? "USD") }
        : null,
      metadata: { source: "jsonld", url },
    }
  }

  private async jsonldList(query: string | undefined, limit: number): Promise<Product[]> {
    const urls = await this.sitemapUrls()
    const out: Product[] = []
    const keys = (query ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    // Bounded: at most 8 slow page reads per call, 3 in flight. One resolve
    // must never fan out to dozens of fetches.
    const started = Date.now()
    const budget = 8_000
    const queue = urls.slice(0, 8)
    while (queue.length && out.length < limit && Date.now() - started < budget) {
      const batch = queue.splice(0, 3)
      const raws = await Promise.all(batch.map((u) => this.fetchJsonLd(u)))
      for (let i = 0; i < batch.length; i++) {
        const raw = raws[i]
        if (!raw) continue
        const mapped = this.jsonldMap(raw, batch[i])
        if (!mapped) continue
        if (keys.length) {
          const text = `${mapped.title} ${mapped.description ?? ""}`.toLowerCase()
          if (!keys.some((k) => text.includes(k))) continue
        }
        out.push(mapped)
        if (out.length >= limit) break
      }
    }
    return out
  }

  private async jsonldGet(key: string): Promise<Product | null> {
    const urls = await this.sitemapUrls()
    const hit = urls.find((u) => u.includes(key)) ?? null
    if (!hit) return null
    const raw = await this.fetchJsonLd(hit)
    return raw ? this.jsonldMap(raw, hit) : null
  }
}

/**
 * Pure JSON-LD → Product reader for the kernel browser lane. The lane hands
 * back the text of every `application/ld+json` script on a fully rendered page
 * (concatenated with newlines, pretty-printed or not), which raw fetch misses
 * when a store hydrates its structured data client-side. Splits balanced JSON
 * documents without trusting line breaks, collects every Product node, dedupes
 * by title. No fetch, no DOM, no side effects.
 */
function splitJsonDocuments(text: string): unknown[] {
  const out: unknown[] = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === "{" || ch === "[") { if (depth === 0) start = i; depth++; continue }
    if (ch === "}" || ch === "]") {
      if (depth === 0) continue
      depth--
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))) } catch { /* skip malformed doc */ }
        start = -1
      }
    }
  }
  return out
}

function collectProductNodes(node: unknown, acc: Record<string, any>[]): void {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) { for (const e of node) collectProductNodes(e, acc); return }
  const obj = node as Record<string, any>
  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]]
  if (types.some((t) => String(t).toLowerCase() === "product")) acc.push(obj)
  if (obj["@graph"]) collectProductNodes(obj["@graph"], acc)
  for (const [k, v] of Object.entries(obj)) {
    if (k === "@type") continue
    if (v && typeof v === "object") collectProductNodes(v, acc)
  }
}

function mapJsonLdProduct(raw: Record<string, any>, url: string): Product | null {
  const title = String(raw.name ?? "").trim()
  if (!title) return null
  const offers = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers
  const spec = offers?.priceSpecification
  const major = Number(offers?.price ?? spec?.minPrice ?? Number.NaN)
  const image = Array.isArray(raw.image) ? raw.image[0] : raw.image
  return {
    id: url,
    title,
    handle: undefined,
    description: raw.description ? String(raw.description).slice(0, 500) : undefined,
    imageUrl: typeof image === "string" ? image : (image?.url ?? null),
    price: Number.isFinite(major)
      ? { amountMinor: Math.round(major * 100), currency: String(offers?.priceCurrency ?? spec?.priceCurrency ?? "USD") }
      : null,
    metadata: { source: "jsonld", url },
  }
}

export function productsFromJsonLdText(text: string, baseUrl: string): Product[] {
  if (typeof text !== "string" || !text) return []
  const acc: Record<string, any>[] = []
  for (const doc of splitJsonDocuments(text.slice(0, 2_000_000))) collectProductNodes(doc, acc)
  const seen = new Set<string>()
  const out: Product[] = []
  for (const node of acc) {
    const mapped = mapJsonLdProduct(node, baseUrl)
    if (!mapped || seen.has(mapped.title)) continue
    seen.add(mapped.title)
    out.push(mapped)
    if (out.length >= 24) break
  }
  return out
}
