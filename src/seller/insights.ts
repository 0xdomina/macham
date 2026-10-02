import { Harness } from "../safety/harness.js"

// Insights Q&A: plain questions over injected store data. Grounding rule:
// data-only JSON in, sourced answer out. Unanswerable means saying so.

// Store snapshot the host injects. Aggregates and rows the seller may see,
// never competitor data.
export type StoreSnapshot = {
  orders?: { id: string; totalMinor: number; createdAt: string }[]
  products?: { id: string; title: string; stock?: number }[]
  totals?: Record<string, number>
}

export const INSIGHTS_CAPABILITY = "insights"

export const insightsContract = {
  type: "object",
  required: ["answer"],
  fields: {
    answer: { type: "string", minLength: 10, maxLength: 1000 },
    unanswerable: { type: "boolean" },
  },
} as const

export type InsightsAnswer = {
  answer: string
  unanswerable?: boolean
}

export async function askInsights(
  harness: Harness,
  input: { question: string; snapshot: StoreSnapshot }
): Promise<InsightsAnswer> {
  const question = (input.question ?? "").trim()
  if (question.length < 5) throw new Error("Ask a fuller question.")
  const data = JSON.stringify(input.snapshot ?? {})
  if (data.length > 20_000) throw new Error("Snapshot too large.")
  return harness.run<InsightsAnswer>(INSIGHTS_CAPABILITY, () => ({
    system: [
      "Store analyst. Answer JSON only with keys answer, unanswerable.",
      "Use only the snapshot below. When it lacks the facts, set",
      "unanswerable true and say what is missing. Never invent numbers.",
    ].join(" "),
    user: `Snapshot: ${data}\nQuestion: ${question}`,
  }))
}
