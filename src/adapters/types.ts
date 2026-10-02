import type { Category, Product } from "../types.js"

// The seam every store implements. Commerce capabilities arrive as
// assistants later; no adapter change is needed to gain them.
export type StoreAdapter = {
  readonly storeId: string
  listProducts(input?: { limit?: number; query?: string; categoryId?: string }): Promise<Product[]>
  getProduct(idOrHandle: string): Promise<Product | null>
  listCategories(): Promise<Category[]>
}
