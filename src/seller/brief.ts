import { Harness, type Contract } from "../safety/harness.js"

// Daily brief: deterministic numbers in, short narrative out. The caller
// computes everything (revenue, margin, movers); the model only narrates.
// Scheduling and storage stay host-side.

export type BriefNumbers = {
  currency: string
  revenueMinor: number
  orders: number
  topMovers: { id: string; title: string; qty: number }[]
  lowStock: { id: string; title: string; left: number }[]
}

export const BRIEF_CAPABILITY = "brief"

export const briefContract: Contract = {
  type: "object",
  required: ["brief"],
  fields: {
    brief: { type: "string", minLength: 40, maxLength: 800 },
    },
};
export async function writeBrief(
  harness: Harness,
  input: { numbers: BriefNumbers }
): Promise<{ brief: string }> {
  const n = input.numbers
  if (!n.currency.trim()) throw new Error("Currency needed.")
  if (!Number.isInteger(n.orders) || n.orders < 0) {
    throw new Error("Order count must be zero or more.")
  }
  return harness.run<{ brief: string }>(BRIEF_CAPABILITY, () => ({
    system: [
      "Store brief writer. Answer JSON only with key brief: 4 to 6",
      "sentences covering revenue, orders, movers, and low stock from the",
      "numbers below. State figures exactly as given. No advice, no forecasts.",
    ].join(" "),
    user: JSON.stringify(n),
  }))
}

// Deterministic opportunity ranker (no model): price uplift, bundle,
// win-back, promo candidates from plain inputs. The explainer narrates.
export type OpportunityInput = {
  id: string
  title: string
  marginPct: number
  salesLast30d: number
  stockLeft: number
}

export type RankedOpportunity = OpportunityInput & {
  kind: "price_uplift" | "bundle" | "win_back" | "promo"
  score: number
}

export function rankOpportunities(items: OpportunityInput[]): RankedOpportunity[] {
  const ranked = items.map((item) => {
    let kind: RankedOpportunity["kind"] = "promo"
    let score = item.salesLast30d
    if (item.stockLeft > 0 && item.stockLeft <= 5 && item.salesLast30d > 0) {
      kind = "win_back"
      score = item.salesLast30d * 2 + (6 - item.stockLeft)
    } else if (item.marginPct >= 40 && item.salesLast30d > 0) {
      kind = "price_uplift"
      score = item.salesLast30d + item.marginPct / 10
    } else if (item.salesLast30d >= 10) {
      kind = "bundle"
      score = item.salesLast30d * 1.5
    }
    return { ...item, kind, score }
  })
  return ranked.sort((a, b) => b.score - a.score)
}


