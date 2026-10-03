import { Harness, type Contract } from "../safety/harness.js"
import type { StoreAdapter } from "../adapters/types.js"
import type { Product } from "../types.js"
import { classifyBuyerIntent, extractKeywords } from "./intent.js"

// Buyer shopping loop: intent → grounded catalog results → comparative
// narration → approvable cart proposal. The model never touches inventory
// or carts; every number comes from the adapter.

export type SearchHit = {
  product: Product
  priceMinor: number | null
}

export const SEARCH_CAPABILITY = "buyer_search"
export const COMPARE_CAPABILITY = "buyer_compare"
export const CART_PROPOSAL_CAPABILITY = "buyer_cart_proposal"

function cheapestPrice(p: Product): number | null {
  const v = p.price
  return v && Number.isFinite(v.amountMinor) ? v.amountMinor : null
}

export async function searchProducts(
  store: StoreAdapter,
  message: string,
  limit = 6
): Promise<SearchHit[]> {
  const keywords = extractKeywords(message).join(" ")
  if (!keywords) return []
  const products = await store.listProducts({ query: keywords, limit })
  return products.slice(0, limit).map((product) => ({
    product,
    priceMinor: cheapestPrice(product),
  }))
}

export const searchContract: Contract = {
  type: "object",
  required: ["summary"],
  fields: {
    summary: { type: "string", minLength: 10, maxLength: 600 },
  },
}

export async function narrateSearch(
  harness: Harness,
  message: string,
  hits: SearchHit[]
): Promise<{ summary: string }> {
  const lines = hits.map(
    (h, i) =>
      `${i + 1}. ${h.product.title} — ${
        h.priceMinor != null ? h.priceMinor : "price on request"
      }`
  )
  return harness.run<{ summary: string }>(SEARCH_CAPABILITY, () => ({
    system: [
      "Shopping guide. Answer JSON only with key summary: two sentences",
      "presenting the matches below. Name real titles and prices only.",
      "Never invent stock, prices, or products.",
    ].join(" "),
    user: `Shopper asked: ${message}\nMatches:\n${lines.join("\n") || "none"}`,
  }))
}

export async function narrateCompare(
  harness: Harness,
  message: string,
  hits: SearchHit[]
): Promise<{ summary: string }> {
  const priced = hits.filter((h) => h.priceMinor != null)
  const cheapest =
    priced.length > 1
      ? priced.reduce((a, b) => (a.priceMinor! < b.priceMinor! ? a : b))
      : null
  return harness.run<{ summary: string }>(COMPARE_CAPABILITY, () => ({
    system: [
      "Comparison guide. Answer JSON only with key summary: name the",
      "cheapest match when one exists, else say so plainly. Real titles",
      "and prices only.",
    ].join(" "),
    user: `Shopper asked: ${message}\nMatches:\n${hits
      .map((h) => `${h.product.title} — ${h.priceMinor ?? "price on request"}`)
      .join("\n")}\nCheapest: ${cheapest ? cheapest.product.title : "none"}`,
  }))
}

export type CartProposal =
  | { action: "add"; productId: string; title: string; qty: number }
  | { action: "remove"; productId: string; title: string }
  | { action: "none"; reason: string }

export const cartProposalContract: Contract = {
  type: "object",
  required: ["action"],
  fields: {
    action: { type: "string", minLength: 3, maxLength: 10 },
    productId: { type: "string" },
    title: { type: "string" },
    qty: { type: "number", min: 1, max: 99 },
    reason: { type: "string", maxLength: 200 },
  },
}

// Proposal, never mutation: the host applies it through its own cart rail
// after the human approves. Unknown products refuse.
export async function proposeCart(
  harness: Harness,
  store: StoreAdapter,
  message: string
): Promise<CartProposal> {
  const intent = classifyBuyerIntent(message)
  if (intent !== "cart_add" && intent !== "cart_remove") {
    return { action: "none", reason: "No cart action asked." }
  }
  const hits = await searchProducts(store, message, 3)
  const best = hits[0]
  if (!best) return { action: "none", reason: "No matching product." }
  const qty =
    (message.match(/(\d+)\s*(x|pieces|units|pcs)?/i)?.[1] ?? "1") || "1"
  const n = Math.min(99, Math.max(1, parseInt(qty, 10) || 1))
  if (intent === "cart_add") {
    return { action: "add", productId: best.product.id, title: best.product.title, qty: n }
  }
  return { action: "remove", productId: best.product.id, title: best.product.title }
}
