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
    const q = (input?.query ?? "").trim().toLowerCase()
    const found = q
      ? DEMO.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q)
        )
      : DEMO
    return found.slice(0, input?.limit ?? 24)
  }

  async getProduct(idOrHandle: string): Promise<Product | null> {
    return DEMO.find((p) => p.id === idOrHandle || p.handle === idOrHandle) ?? null
  }

  async listCategories() {
    return [{ id: "demo-all", name: "Everything" }]
  }
}
