import { tenantIdOf, type TenantContext } from "../tenancy/context.js"

// Merchant guardrails. The model proposes; rules dispose. Every decision
// records who, what, why, and until when. Tenant-scoped like everything.

// A concession under review: proposed unit price against the anchors.
export type Proposal = {
  sku: string
  listUnitMinor: number
  proposedUnitMinor: number
  quantity: number
  brand?: string
  category?: string
}

// Per-tenant policy. All money fields minor units. Optional fields fall
// back to safe defaults (deny).
export type GuardrailPolicy = {
  // Hard floor: unit cost basis. Proposals below never pass, no approver.
  costFloorMinor?: number
  // Max discount off list that auto-passes (0-100). Above needs approval.
  maxAutoDiscountPct?: number
  // Brand MAP floors: advertised price must stay at or above these.
  mapFloorsMinor?: Record<string, number>
  // Amounts at/above this total need a human approver (minor units).
  approvalAboveMinor?: number
  // Approver contact for routing (email, chat id). Informational only.
  approver?: string
}

export type Verdict =
  | { ok: true; auto: true; discountPct: number }
  | { ok: true; auto: false; needsApproval: string; discountPct: number }
  | { ok: false; reason: string }

export type AuditEntry = {
  at: number
  tenantId: string
  actorId?: string
  sku: string
  proposedUnitMinor: number
  verdict: string
  reason?: string
}

const DEFAULT_MAX_AUTO_PCT = 5

function discountPct(list: number, proposed: number): number {
  if (!(list > 0)) return 0
  return Math.max(0, ((list - proposed) / list) * 100)
}

/** Judge one proposal. Pure function — no store, no network. */
export function judge(
  ctx: TenantContext,
  policy: GuardrailPolicy,
  proposal: Proposal
): Verdict {
  const tenantId = tenantIdOf(ctx)
  void tenantId
  const { listUnitMinor, proposedUnitMinor } = proposal
  if (!(listUnitMinor > 0)) return { ok: false, reason: "List price needed." }
  if (!(proposedUnitMinor > 0)) return { ok: false, reason: "Price must be positive." }
  if (policy.costFloorMinor != null && proposedUnitMinor < policy.costFloorMinor) {
    return { ok: false, reason: "Below cost floor." }
  }
  const pct = discountPct(listUnitMinor, proposedUnitMinor)
  const mapFloor = proposal.brand ? policy.mapFloorsMinor?.[proposal.brand] : undefined
  if (mapFloor != null && proposedUnitMinor < mapFloor) {
    return { ok: false, reason: "Below brand floor." }
  }
  const maxAuto = policy.maxAutoDiscountPct ?? DEFAULT_MAX_AUTO_PCT
  const total = proposedUnitMinor * Math.max(1, proposal.quantity)
  if (pct <= maxAuto) {
    const approveAt = policy.approvalAboveMinor
    if (approveAt != null && total >= approveAt) {
      return {
        ok: true,
        auto: false,
        needsApproval: policy.approver ?? "approver",
        discountPct: pct,
      }
    }
    return { ok: true, auto: true, discountPct: pct }
  }
  return {
    ok: true,
    auto: false,
    needsApproval: policy.approver ?? "approver",
    discountPct: pct,
  }
}

function entry(
  ctx: TenantContext,
  proposal: Proposal,
  verdict: Verdict
): AuditEntry {
  return {
    at: Date.now(),
    tenantId: tenantIdOf(ctx),
    actorId: ctx.actorId,
    sku: proposal.sku,
    proposedUnitMinor: proposal.proposedUnitMinor,
    verdict: !verdict.ok ? "denied" : verdict.auto ? "auto" : "approval",
    reason: !verdict.ok ? verdict.reason : undefined,
  }
}

/** Policy store. Namespaced per tenant; hosts swap in DB storage. */
export class GuardrailStore {
  private readonly policies = new Map<string, GuardrailPolicy>()
  private readonly audit: AuditEntry[] = []
  private static readonly AUDIT_CAP = 1000

  private key(ctx: TenantContext): string {
    return tenantIdOf(ctx)
  }

  setPolicy(ctx: TenantContext, policy: GuardrailPolicy): void {
    if (
      policy.maxAutoDiscountPct != null &&
      (policy.maxAutoDiscountPct < 0 || policy.maxAutoDiscountPct > 100)
    ) {
      throw new Error("Discount cap must sit 0 to 100.")
    }
    this.policies.set(this.key(ctx), { ...policy })
  }

  decide(
    ctx: TenantContext,
    proposal: Proposal
  ): { verdict: Verdict; logged: AuditEntry } {
    const policy = this.policies.get(this.key(ctx)) ?? {}
    const verdict = judge(ctx, policy, proposal)
    const record = entry(ctx, proposal, verdict)
    this.audit.push(record)
    while (this.audit.length > GuardrailStore.AUDIT_CAP) this.audit.shift()
    return { verdict, logged: record }
  }

  trail(ctx: TenantContext): AuditEntry[] {
    const id = tenantIdOf(ctx)
    return this.audit.filter((e) => e.tenantId === id).map((e) => ({ ...e }))
  }
}
