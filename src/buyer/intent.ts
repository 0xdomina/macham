// Intent classifier: cheap regex routing, no model call. Safe fallback to
// search-first intents. Ported pattern, reimplemented clean.

export type BuyerIntent =
  | "cart_add"
  | "cart_remove"
  | "price_compare"
  | "review_summary"
  | "sort"
  | "product_search"
  | "general"

export type SortOrder = "price-asc" | "price-desc" | "title"

// "cheapest first" is an ordering request, not a comparison between two named
// things, so it is checked before price_compare.
export function sortOrder(message: string): SortOrder | null {
  const t = (message ?? "").toLowerCase()
  if (/\b(most expensive|dearest|priciest|highest|price high|costly)\b/.test(t)) return "price-desc"
  if (/\b(cheapest|lowest|cheaper|budget|affordable|price low|inexpensive)\b/.test(t) || /\bsort\b.*\bprice\b/.test(t)) return "price-asc"
  if (/\ba to z\b|\balphabetical/.test(t)) return "title"
  return null
}

const STOPWORDS = new Set(
  "a,an,the,and,or,for,to,of,in,on,with,me,my,i,please,show,find,get,hello,hi,hey,there,friend,thanks,thank,yo,dear".split(",")
)

export function extractKeywords(message: string): string[] {
  return (message ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
}

// "cheapest tv" asks for an order over televisions, so the ordering words must
// not be left in the search: a store has no product titled "cheapest".
const SORT_WORDS = /\b(cheapest|lowest|cheaper|budget|affordable|inexpensive|most expensive|dearest|priciest|highest|costly|sort|order|arrange|by price|a to z|alphabetical|first|last)\b/gi

export function stripSortWords(message: string): string {
  const cleaned = (message ?? "").replace(SORT_WORDS, " ").replace(/\s+/g, " ").trim()
  return cleaned
}

export function classifyBuyerIntent(message: string): BuyerIntent {
  const text = (message ?? "").toLowerCase()
  if (/(add|put).*(cart|bag|basket)|buy this|add it\b/.test(text)) return "cart_add"
  if (/(remove|take out|delete).*(cart|bag|basket)|remove it\b/.test(text)) {
    return "cart_remove"
  }
  // A question that compares two things is not an ordering request, even when it
  // uses the word "cheaper": "which is cheaper, tee or cap" wants an answer,
  // not the list re-sorted.
  if (/compare|versus|\bvs\b|better deal|\bwhich\b.*\b(cheaper|cheapest|better|pricier)\b/.test(text)) {
    return "price_compare"
  }
  // An ordering request next: "cheapest tv" wants the list sorted, not two
  // televisions compared.
  if (sortOrder(text)) return "sort"
  if (/review|rating|rated|stars|feedback|what do people say/.test(text)) {
    return "review_summary"
  }
  if (extractKeywords(message).length > 0) return "product_search"
  return "general"
}
