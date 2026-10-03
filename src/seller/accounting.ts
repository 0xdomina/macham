import { Harness, type Contract } from "../safety/harness.js"

// Accounting digest: caller-computed aggregates become a plain-language
// summary. Deterministic totals, model narrates. The money math never
// happens inside a prompt.

export type LedgerAggregates = {
  currency: string
  grossMinor: number
  commissionMinor: number
  netMinor: number
  byMonth?: { month: string; grossMinor: number; netMinor: number }[]
}

export const ACCOUNTING_CAPABILITY = "accounting"

export const accountingContract: Contract = {
  type: "object",
  required: ["digest"],
  fields: {
    digest: { type: "string", minLength: 20, maxLength: 1000 },
    },
};
export async function writeAccountingDigest(
  harness: Harness,
  input: { aggregates: LedgerAggregates }
): Promise<{ digest: string }> {
  const a = input.aggregates
  for (const [k, v] of Object.entries({
    gross: a.grossMinor,
    commission: a.commissionMinor,
    net: a.netMinor,
  })) {
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`Ledger ${k} must be zero or more.`)
    }
  }
  if (!a.currency.trim()) throw new Error("Currency needed.")
  return harness.run<{ digest: string }>(ACCOUNTING_CAPABILITY, () => ({
    system: [
      "Bookkeeper. Answer JSON only with key digest: one plain paragraph",
      "stating gross, commission, and net with the currency. No advice,",
      "no forecasts, no commentary.",
    ].join(" "),
    user: `Currency: ${a.currency}\nGross: ${a.grossMinor}\nCommission: ${a.commissionMinor}\nNet: ${a.netMinor}${
      a.byMonth?.length
        ? `\nMonths: ${a.byMonth.map((m) => `${m.month} ${m.grossMinor}/${m.netMinor}`).join(", ")}`
        : ""
    }`,
  }))
}


