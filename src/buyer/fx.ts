import type { Product } from "../types.js"

// A price the shopper can read in the money they think in, next to the price the
// store will actually charge.
//
// Macham never takes custody of the money: the store charges the buyer and PayPal
// converts at checkout. So this is an ESTIMATE, marked as one, and it is only
// shown when the host supplies a rate. No rate, no number — a made-up conversion
// on a price is worse than no conversion at all.

export type FxDisplay = {
  /** The shopper's currency, e.g. "USD". */
  currency: string
  /** Units of `to` per one unit of `from`. A host with an FX provider passes it. */
  rate: (from: string, to: string) => Promise<number | null> | number | null
}

export type FxRates = Map<string, number>

const key = (from: string, to: string): string => `${from.toUpperCase()}>${to.toUpperCase()}`

/** Fetch one rate per currency pair in the result set, skipping what fails. */
export async function loadRates(products: Product[], fx?: FxDisplay): Promise<FxRates> {
  const rates: FxRates = new Map()
  if (!fx?.currency) return rates
  const to = fx.currency.toUpperCase()
  const pairs = new Set<string>()
  for (const p of products) {
    const from = p.price?.currency
    if (from && from.toUpperCase() !== to) pairs.add(from.toUpperCase())
  }
  await Promise.all([...pairs].map(async (from) => {
    try {
      const rate = await fx.rate(from, to)
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates.set(key(from, to), rate)
    } catch {
      // A missing rate is a missing estimate, not a broken product card.
    }
  }))
  return rates
}

/**
 * "≈ USD 43.21" for a product priced in another currency, or null when there is
 * no rate to stand behind. Minor units in, major units out.
 */
export function estimateLabel(product: Product, fx: FxDisplay | undefined, rates: FxRates): string | null {
  const minor = product.price?.amountMinor
  const from = product.price?.currency
  if (!fx?.currency || minor == null || !Number.isFinite(minor) || !from) return null
  const rate = rates.get(key(from, fx.currency))
  if (rate == null) return null
  const converted = (minor / 100) * rate
  return `\u2248 ${fx.currency.toUpperCase()} ${converted.toFixed(2)}`
}

/** The tooltip that keeps the estimate honest. */
export function estimateNote(product: Product, fx?: FxDisplay): string {
  const from = product.price?.currency ?? "the store's currency"
  return `Estimate only. The store charges ${from}; your bank or PayPal converts at checkout.`
}
