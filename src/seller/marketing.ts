import { Harness } from "../safety/harness.js"

// Marketing coach: low-budget promo and bundle ideas from the caller's
// real catalog. Suggestions reference actual product ids — never invented
// stock.

export type CatalogItem = {
  id: string
  title: string
  priceMinor?: number
}

export const MARKETING_CAPABILITY = "marketing"

export const marketingContract = {
  type: "object",
  required: ["ideas"],
  fields: {
    ideas: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        required: ["title", "action"],
        fields: {
          title: { type: "string", minLength: 5, maxLength: 80 },
          action: { type: "string", minLength: 10, maxLength: 300 },
          productIds: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
} as const

export type MarketingIdea = {
  title: string
  action: string
  productIds?: string[]
}

export async function coachMarketing(
  harness: Harness,
  input: { goal: string; catalog: CatalogItem[] }
): Promise<{ ideas: MarketingIdea[] }> {
  const goal = (input.goal ?? "").trim()
  if (goal.length < 10) throw new Error("State the goal first.")
  if (!input.catalog.length || input.catalog.length > 50) {
    throw new Error("Catalog must hold 1 to 50 items.")
  }
  const known = new Set(input.catalog.map((c) => c.id))
  const out = await harness.run<{ ideas: MarketingIdea[] }>(
    MARKETING_CAPABILITY,
    () => ({
      system: [
        "Marketing coach. Answer JSON only with key ideas: up to 5 items,",
        "each title, action, and productIds drawn ONLY from the catalog",
        "below. No invented products. No markdown.",
      ].join(" "),
      user: `Goal: ${goal}\nCatalog: ${JSON.stringify(
        input.catalog.map((c) => ({ id: c.id, title: c.title }))
      )}`,
    })
  )
  // Deterministic backstop: every referenced id must exist.
  for (const idea of out.ideas) {
    for (const id of idea.productIds ?? []) {
      if (!known.has(id)) throw new Error("Unknown product referenced.")
    }
  }
  return out
}
