import { Harness } from "../safety/harness.js"

// Pricing advisor: suggested, floor, and ceiling prices from anonymized
// market aggregates the caller supplies. Never competitor rows, never
// raw listings — aggregates in, guidance out.

export type MarketStats = {
  minMinor: number
  medianMinor: number
  maxMinor: number
  currency: string
}

export type PricingInput = {
  title: string
  category?: string
  costMinor?: number
  stats: MarketStats
}

export type PricingAdvice = {
  suggestedMinor: number
  floorMinor: number
  ceilingMinor: number
  reasoning: string
}

export const PRICING_CAPABILITY = "pricing"

export const pricingContract = {
  type: "object",
  required: ["suggestedMinor", "floorMinor", "ceilingMinor", "reasoning"],
  fields: {
    suggestedMinor: { type: "number", min: 1 },
    floorMinor: { type: "number", min: 1 },
    ceilingMinor: { type: "number", min: 1 },
    reasoning: { type: "string", minLength: 10, maxLength: 500 },
  },
} as const

export async function advisePricing(
  harness: Harness,
  input: PricingInput
): Promise<PricingAdvice> {
  const { stats } = input
  for (const [k, v] of Object.entries({
    min: stats.minMinor,
    median: stats.medianMinor,
    max: stats.maxMinor,
  })) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`Market ${k} must be positive.`)
    }
  }
  if (!input.title.trim()) throw new Error("Product title needed.")
  const out = await harness.run<PricingAdvice>(PRICING_CAPABILITY, () => ({
    system: [
      "Price advisor. Answer JSON only with keys suggestedMinor,",
      "floorMinor, ceilingMinor, reasoning. Stay inside the stats band.",
      "Cost floor wins over everything when given. No markdown, no commentary.",
    ].join(" "),
    user: [
      `Product: ${input.title}`,
      `Category: ${input.category ?? "general"}`,
      input.costMinor != null ? `Cost: ${input.costMinor}` : null,
      `Market minor units: min ${stats.minMinor}, median ${stats.medianMinor}, max ${stats.maxMinor} ${stats.currency}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  }))
  // Deterministic backstops the model cannot cross: floor respects cost,
  // ceiling respects the observed max.
  const floor = Math.max(
    out.floorMinor,
    input.costMinor != null ? Math.ceil(input.costMinor * 1.01) : 1
  )
  const ceiling = Math.min(out.ceilingMinor, stats.maxMinor)
  const suggested = Math.min(Math.max(out.suggestedMinor, floor), ceiling)
  return { ...out, floorMinor: floor, ceilingMinor: ceiling, suggestedMinor: suggested }
}
