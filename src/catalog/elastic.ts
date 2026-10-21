import type { Product } from "../types.js"

// Elastic semantic lane: hybrid BM25 plus kNN over the merchant catalog.
// Stateless HTTP client (injectable fetch). Index mapping ships a
// dense_vector field; the kNN clause activates only when rows carry
// embeddings, otherwise pure BM25 ranks. Embeddings arrive via ELSER or the
// inference service on hosted trials; self-host Docker is free forever.
// No key in the browser. Fail-closed strings throughout.

export type ElasticDoc = {
  id: string
  title: string
  description?: string
  handle?: string
  imageUrl?: string | null
  amountMinor?: number | null
  currency?: string
  embedding?: number[]
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const INDEX = "macham-products"

export class ElasticCatalog {
  private readonly base: string
  private readonly key: string
  private readonly fetch: Fetcher
  private readonly timeoutMs: number

  constructor(url: string, apiKey: string, fetcher: Fetcher = fetch, opts?: { timeoutMs?: number }) {
    const base = (url ?? "").trim().replace(/\/$/, "")
    if (!base) throw new Error("Elastic URL needed.")
    if (!apiKey) throw new Error("Elastic key needed.")
    this.base = base
    this.key = apiKey
    this.fetch = fetcher
    this.timeoutMs = opts?.timeoutMs ?? 15_000
  }

  static mapping(): Record<string, unknown> {
    return {
      mappings: {
        properties: {
          title: { type: "text" },
          description: { type: "text" },
          handle: { type: "keyword" },
          embedding: { type: "dense_vector", dims: 384, index: true, similarity: "cosine" },
        },
      },
    }
  }

  async ensureIndex(): Promise<boolean> {
    const res = await this.call("PUT", `/${INDEX}`, ElasticCatalog.mapping())
    return res.ok
  }

  async index(docs: ElasticDoc[]): Promise<number> {
    if (!docs.length) return 0
    const lines: string[] = []
    for (const d of docs.slice(0, 500)) {
      if (!d.id || !d.title) continue
      lines.push(JSON.stringify({ index: { _index: INDEX, _id: d.id } }))
      lines.push(
        JSON.stringify({
          title: d.title,
          description: d.description ?? "",
          handle: d.handle ?? "",
          imageUrl: d.imageUrl ?? null,
          amountMinor: d.amountMinor ?? null,
          currency: d.currency ?? "USD",
          ...(d.embedding?.length ? { embedding: d.embedding } : {}),
        })
      )
    }
    if (!lines.length) return 0
    const res = await this.raw("POST", "/_bulk", lines.join("\n") + "\n", "application/x-ndjson")
    if (!res.ok) throw new Error("Index write failed.")
    const body = (await res.json()) as { errors?: boolean; items?: unknown[] }
    if (body.errors) throw new Error("Index write partial.")
    return (body.items ?? []).length
  }

  /** Hybrid search. Vector ranks only when queryEmbedding is supplied. */
  async search(query: string, opts?: { limit?: number; queryEmbedding?: number[] }): Promise<Product[]> {
    const q = (query ?? "").trim()
    if (!q) throw new Error("Search words needed.")
    const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 30)
    const standard = { multi_match: { query: q, fields: ["title^3", "description"], type: "best_fields" } }
    const body =
      opts?.queryEmbedding?.length
        ? {
            retriever: {
              rrf: {
                retrievers: [
                  { standard: { query: standard } },
                  { knn: { field: "embedding", query_vector: opts.queryEmbedding, k: limit, num_candidates: 100 } },
                ],
              },
            },
            size: limit,
          }
        : { query: standard, size: limit }
    const res = await this.call("POST", `/${INDEX}/_search`, body)
    if (!res.ok) throw new Error("Search failed.")
    const data = (await res.json()) as { hits?: { hits?: { _id: string; _source: any }[] } }
    return ((data.hits?.hits ?? []) as { _id: string; _source: any }[]).map((h) => ({
      id: String(h._id),
      title: String(h._source?.title ?? "Untitled"),
      handle: h._source?.handle ? String(h._source.handle) : undefined,
      description: h._source?.description ? String(h._source.description).slice(0, 500) : undefined,
      imageUrl: h._source?.imageUrl ?? null,
      price:
        h._source?.amountMinor != null
          ? { amountMinor: Number(h._source.amountMinor), currency: String(h._source?.currency ?? "USD") }
          : null,
      metadata: { source: "elastic" },
    }))
  }

  private async call(method: string, path: string, body: unknown): Promise<Response> {
    return this.raw(method, path, JSON.stringify(body), "application/json")
  }

  private async raw(method: string, path: string, body: string, contentType: string): Promise<Response> {
    let res: Response
    try {
      res = await this.fetch(`${this.base}${path}`, {
        method,
        headers: { authorization: `ApiKey ${this.key}`, "content-type": contentType },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new Error("Elastic unreachable.")
    }
    if (res.status === 401) throw new Error("Elastic key rejected.")
    return res
  }
}
