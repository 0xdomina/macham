import type { Product } from "../types.js"
import type { StoreAdapter } from "./types.js"

// In-memory reference catalog. Mount it to exercise the full agent loop —
// search, compare, cart proposals — before wiring a real store adapter.
const SEED: Product[] = [
  {
    id: "tee",
    title: "Classic Tee",
    handle: "tee",
    description: "Organic cotton crew-neck tee.",
    price: { amountMinor: 250000, currency: "NGN" },
  },
  {
    id: "cap",
    title: "Everyday Cap",
    handle: "cap",
    description: "Six-panel cotton cap.",
    price: { amountMinor: 150000, currency: "NGN" },
  },
]

export class InMemoryStoreAdapter implements StoreAdapter {
  readonly storeId = "in-memory-store"

  async listProducts(input?: { limit?: number; query?: string; categoryId?: string }): Promise<Product[]> {
    const keys = (input?.query ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
    if (!keys.length) return SEED.slice(0, input?.limit ?? 24)
    const found = SEED.filter((p) => {
      const text = `${p.title} ${p.description ?? ""}`.toLowerCase()
      const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      return keys.some(
        (k) => text.includes(k) || words.some((w) => k.includes(w) || w.includes(k))
      )
    })
    return found.slice(0, input?.limit ?? 24)
  }

  async getProduct(idOrHandle: string): Promise<Product | null> {
    return SEED.find((p) => p.id === idOrHandle || p.handle === idOrHandle) ?? null
  }

  async listCategories() {
    return [{ id: "all", name: "Everything" }]
  }
}
