// Pricing: free to build, pay when assistance earns. Limits are data,
// enforced by hosts. Money math stays out of prompts.

// Monthly budgets in minor units where money applies; counts elsewhere.
export type PlanLimits = {
  assistedSessions: number | null
  modelCalls: number | null
  seats: number | null
}

export type Plan = {
  id: "free" | "pro" | "team"
  name: string
  priceMinor: number | null
  limits: PlanLimits
}

export const PLANS: Record<Plan["id"], Plan> = {
  free: {
    id: "free",
    name: "Build",
    priceMinor: null,
    limits: { assistedSessions: 500, modelCalls: 10_000, seats: 3 },
  },
  pro: {
    id: "pro",
    name: "Grow",
    priceMinor: 2_000_00,
    limits: { assistedSessions: 20_000, modelCalls: 500_000, seats: 25 },
  },
  team: {
    id: "team",
    name: "Scale",
    priceMinor: null,
    limits: { assistedSessions: null, modelCalls: null, seats: null },
  },
}

export type Usage = {
  assistedSessions: number
  modelCalls: number
  seats: number
}

export type LimitCheck =
  | { ok: true }
  | { ok: false; reason: string; metric: keyof Usage }

/** Null limit means unbounded. Zero usage with zero activity passes. */
export function checkLimits(plan: Plan, usage: Usage): LimitCheck {
  const order: (keyof Usage)[] = ["assistedSessions", "modelCalls", "seats"]
  for (const metric of order) {
    const cap = plan.limits[metric]
    if (cap == null) continue
    if (usage[metric] >= cap) {
      return { ok: false, reason: "Plan limit reached. Upgrade to continue.", metric }
    }
  }
  return { ok: true }
}
