import { Harness } from "../safety/harness.js"
import type { StoreAdapter } from "../adapters/types.js"
import type { Product } from "../types.js"
import {
  classifyBuyerIntent,
  type BuyerIntent,
} from "./intent.js"
import { narrateCompare, narrateSearch, proposeCart, searchProducts } from "./shop.js"

// Threaded buyer chat: bounded history, intent-routed tools, grounded
// narration. Guests and signed-in actors alike; the host owns storage and
// carts. The loop never mutates commerce state.

export type ChatTurn = {
  role: "user" | "assistant"
  text: string
}

export type ChatReply = {
  intent: BuyerIntent
  text: string
  proposal?: { action: string; productId?: string; title?: string; qty?: number }
  // The catalog rows behind a search/compare answer, so the widget can draw
  // product cards with images. Numbers still come only from the adapter.
  products?: Product[]
}

const MAX_HISTORY = 40

export function trimHistory(history: ChatTurn[]): ChatTurn[] {
  if (history.length <= MAX_HISTORY) return history
  return history.slice(history.length - MAX_HISTORY)
}

export async function chatTurn(
  harness: Harness,
  store: StoreAdapter,
  history: ChatTurn[],
  message: string
): Promise<{ reply: ChatReply; history: ChatTurn[] }> {
  const text = (message ?? "").trim()
  if (!text) throw new Error("Message needed.")
  const intent = classifyBuyerIntent(text)
  const log = trimHistory([...history, { role: "user", text } as ChatTurn])

  if (intent === "cart_add" || intent === "cart_remove") {
    const proposal = await proposeCart(harness, store, text)
    if (proposal.action === "none") {
      return {
        reply: { intent, text: "No matching product. Try other words." },
        history: [...log, { role: "assistant", text: "No matching product." } as ChatTurn],
      }
    }
    const wording =
      proposal.action === "add"
        ? `Add ${proposal.qty} × ${proposal.title} to your bag?`
        : `Remove ${proposal.title} from your bag?`
    return {
      reply: { intent, text: wording, proposal },
      history: [...log, { role: "assistant", text: wording } as ChatTurn],
    }
  }

  if (intent === "product_search" || intent === "price_compare" || intent === "review_summary") {
    const hits = await searchProducts(store, text)
    if (!hits.length) {
      const reply = "Nothing matched. Try other words."
      return {
        reply: { intent, text: reply },
        history: [...log, { role: "assistant", text: reply } as ChatTurn],
      }
    }
    const { summary } =
      intent === "price_compare"
        ? await narrateCompare(harness, text, hits)
        : await narrateSearch(harness, text, hits)
    return {
      reply: { intent, text: summary, products: hits.map((hit) => hit.product) },
      history: [...log, { role: "assistant", text: summary } as ChatTurn],
    }
  }

  // General: small talk stays small. Commerce questions route back to search.
  const fallback =
    "I help you find things and manage your bag. Tell me what you need."
  return {
    reply: { intent, text: fallback },
    history: [...log, { role: "assistant", text: fallback } as ChatTurn],
  }
}
