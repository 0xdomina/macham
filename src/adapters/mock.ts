import type { Product } from "../types.js"
import type { StoreAdapter } from "./types.js"

const DEMO: Product[] = [
  {
    id: "demo-tee",
    title: "Demo Tee",
    handle: "demo-tee",
    description: "A plain tee for proving the adapter seam.",
    price: { amountMinor: 250000, currency: "NGN" },
  },
  {
    id: "demo-cap",
    title: "Demo Cap",
    handle: "demo-cap",
    description: "A plain cap for proving the search path.",
    price: { amountMinor: 150000, currency: "NGN" },
  },
]

export class MockStoreAdapter implements StoreAdapter {
  readonly storeId = "mock-demo-store"

  async listProducts(input?: { limit?: number; query?: string; categoryId?: string }): Promise<Product[]> {
    const keys = (input?.query ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
    if (!keys.length) return DEMO.slice(0, input?.limit ?? 24)
    const found = DEMO.filter((p) => {
      const text = `${p.title} ${p.description ?? ""}`.toLowerCase()
      const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      return keys.some(
        (k) => text.includes(k) || words.some((w) => k.includes(w) || w.includes(k))
      )
    })
    return found.slice(0, input?.limit ?? 24)
  }

  async getProduct(idOrHandle: string): Promise<Product | null> {
    return DEMO.find((p) => p.id === idOrHandle || p.handle === idOrHandle) ?? null
  }

  async listCategories() {
    return [{ id: "demo-all", name: "Everything" }]
  }
}
