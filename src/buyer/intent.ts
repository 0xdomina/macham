// Intent classifier: cheap regex routing, no model call. Safe fallback to
// search-first intents. Ported pattern, reimplemented clean.

export type BuyerIntent =
  | "cart_add"
  | "cart_remove"
  | "price_compare"
  | "review_summary"
  | "product_search"
  | "general"

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

export function classifyBuyerIntent(message: string): BuyerIntent {
  const text = (message ?? "").toLowerCase()
  if (/(add|put).*(cart|bag|basket)|buy this|add it\b/.test(text)) return "cart_add"
  if (/(remove|take out|delete).*(cart|bag|basket)|remove it\b/.test(text)) {
    return "cart_remove"
  }
  if (/cheaper|cheapest|compare|versus|\bvs\b|better deal|price of.*and/.test(text)) {
    return "price_compare"
  }
  if (/review|rating|rated|stars|feedback|what do people say/.test(text)) {
    return "review_summary"
  }
  if (extractKeywords(message).length > 0) return "product_search"
  return "general"
}
