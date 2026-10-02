import type { Product } from "../types.js"

// Channel3 catalog enrichment: unified cross-retailer search behind the
// adapter seam. Server key only — never the browser. Key via constructor;
// every call fails closed with a short message.

export type Channel3Offer = {
  url: string
  domain?: string
  priceMinor?: number | null
  currency?: string
  availability?: string
}

export type Channel3Product = {
  id: string
  title: string
  images: string[]
  offers: Channel3Offer[]
}

export class Channel3Client {
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(
    private readonly apiKey: string,
    opts?: { baseUrl?: string; timeoutMs?: number }
  ) {
    if (!apiKey) throw new Error("Channel3 API key needed.")
    if (typeof window !== "undefined") {
      throw new Error("Channel3 runs server-side only.")
    }
    this.baseUrl = (opts?.baseUrl ?? "https://api.trychannel3.com").replace(/\/$/, "")
    this.timeoutMs = opts?.timeoutMs ?? 20_000
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (res.status === 402) throw new Error("Channel3 credits spent.")
    if (res.status === 429) throw new Error("Channel3 throttled. Retry.")
    if (!res.ok) throw new Error(`Channel3 answered ${res.status}.`)
    return (await res.json()) as T
  }

  async search(
    query: string,
    opts?: { limit?: number; minPriceMinor?: number; maxPriceMinor?: number; currency?: string }
  ): Promise<Channel3Product[]> {
    const q = (query ?? "").trim()
    if (!q) throw new Error("Search words needed.")
    const data = await this.post<{ products: any[] }>("/v1/search", {
      query: q,
      limit: Math.min(Math.max(opts?.limit ?? 10, 1), 30),
      filters: {
        ...(opts?.minPriceMinor != null || opts?.maxPriceMinor != null
          ? {
              price: {
                ...(opts.minPriceMinor != null ? { min_price: opts.minPriceMinor / 100 } : {}),
                ...(opts.maxPriceMinor != null ? { max_price: opts.maxPriceMinor / 100 } : {}),
              },
            }
          : {}),
      },
      config: opts?.currency ? { currency: opts.currency } : {},
    })
    return (data.products ?? []).map(toProduct)
  }

  async lookup(url: string): Promise<Channel3Product | null> {
    if (!url.trim()) throw new Error("Product URL needed.")
    try {
      const data = await this.post<{ product?: any }>("/v1/lookup", { url })
      return data.product ? toProduct(data.product) : null
    } catch {
      return null
    }
  }
}

function toProduct(raw: any): Channel3Product {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? "Untitled"),
    images: Array.isArray(raw?.images) ? raw.images.filter((u: unknown) => typeof u === "string") : [],
    offers: Array.isArray(raw?.offers)
      ? raw.offers.map((o: any) => ({
          url: String(o?.url ?? ""),
          domain: o?.domain ? String(o.domain) : undefined,
          priceMinor:
            o?.price?.price != null ? Math.round(Number(o.price.price) * 100) : null,
          currency: o?.price?.currency ? String(o.price.currency) : undefined,
          availability: o?.availability ? String(o.availability) : undefined,
        }))
      : [],
  }
}

export function toMachamProduct(p: Channel3Product): Product {
  const best = p.offers[0]
  return {
    id: p.id,
    title: p.title,
    imageUrl: p.images[0] ?? null,
    price:
      best?.priceMinor != null
        ? { amountMinor: best.priceMinor, currency: best.currency ?? "USD" }
        : null,
    metadata: { source: "channel3", offers: p.offers.length },
  }
}
