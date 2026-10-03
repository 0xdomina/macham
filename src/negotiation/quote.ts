import { randomUUID } from "node:crypto"
import { tenantIdOf, type TenantContext } from "../tenancy/context.js"

// Request-for-quote lifecycle. Buyer posts intent; seller side counters;
// both sides move a finite state machine with expiring offers. Tenant
// scoped throughout: platform A's quotes never surface on platform B.

export type QuoteState =
  | "draft"
  | "in_review"
  | "presented"
  | "accepted"
  | "expired"

export type QuoteRequest = {
  id: string
  sku: string
  quantity: number
  shipTo?: string
  targetUnitMinor?: number
  note?: string
  state: QuoteState
  createdAt: number
  expiresAt: number
  rounds: number
}

export type CounterOffer = {
  unitMinor: number
  minQty: number
  leadDays?: number
  expiresAt: number
  note?: string
}

export const MAX_ROUNDS = 5

function now(): number {
  return Date.now()
}

export function createRequest(
  ctx: TenantContext,
  input: {
    sku: string
    quantity: number
    shipTo?: string
    targetUnitMinor?: number
    note?: string
    ttlHours?: number
  }
): QuoteRequest {
  tenantIdOf(ctx)
  const sku = (input.sku ?? "").trim()
  if (!sku) throw new Error("SKU needed.")
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Quantity must be 1 or more.")
  }
  const ttl = input.ttlHours ?? 48
  if (!(ttl > 0) || ttl > 24 * 14) throw new Error("Expiry must be within 14 days.")
  return {
    id: `q_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    sku,
    quantity: input.quantity,
    shipTo: input.shipTo,
    targetUnitMinor: input.targetUnitMinor,
    note: input.note,
    state: "draft",
    createdAt: now(),
    expiresAt: now() + ttl * 3_600_000,
    rounds: 0,
  }
}

export type PresentResult =
  | { ok: true; request: QuoteRequest; offer: CounterOffer }
  | { ok: false; reason: string }

// Seller counters. Pure transition: validates shape and expiry, bumps the
// round, returns the presented state. Price judgment belongs to guardrails,
// not here — except the deterministic auto bounds below.
export function presentCounter(
  request: QuoteRequest,
  offer: CounterOffer,
  // floorMinor refuses below-floor counters now. autoAcceptMinor is
  // reserved for buyer-initiated offers (accept under ceiling) next.
  opts?: { floorMinor?: number; autoAcceptMinor?: number }
): PresentResult {
  if (request.state !== "draft" && request.state !== "in_review") {
    return { ok: false, reason: "Quote is closed." }
  }
  if (request.expiresAt < now()) {
    return { ok: false, reason: "Quote expired." }
  }
  if (request.rounds >= MAX_ROUNDS) {
    return { ok: false, reason: "No rounds left." }
  }
  if (!Number.isFinite(offer.unitMinor) || offer.unitMinor <= 0) {
    return { ok: false, reason: "Price must be positive." }
  }
  if (opts?.floorMinor != null && offer.unitMinor < opts.floorMinor) {
    return { ok: false, reason: "Below the floor." }
  }
  const next: QuoteRequest = {
    ...request,
    state: "presented",
    rounds: request.rounds + 1,
  }
  return { ok: true, request: next, offer }
}

export type SettleResult =
  | { ok: true; request: QuoteRequest }
  | { ok: false; reason: string }

/** Buyer accepts the presented counter. Anything else is a no-op refusal. */
export function acceptPresented(request: QuoteRequest): SettleResult {
  if (request.state !== "presented") {
    return { ok: false, reason: "Nothing presented." }
  }
  if (request.expiresAt < now()) {
    return { ok: false, reason: "Quote expired." }
  }
  return { ok: true, request: { ...request, state: "accepted" } }
}

/** Sweep helper: anything past expiry that isn't accepted closes itself. */
export function sweepExpired(request: QuoteRequest): QuoteRequest {
  if (
    (request.state === "draft" ||
      request.state === "in_review" ||
      request.state === "presented") &&
    request.expiresAt < now()
  ) {
    return { ...request, state: "expired" }
  }
  return request
}

/** Tenant-scoped quote registry. Hosts swap in DB storage behind it. */
export class QuoteRegistry {
  private readonly data = new Map<string, QuoteRequest>()

  private key(ctx: TenantContext, id: string): string {
    return `${tenantIdOf(ctx)}:${id}`
  }

  put(ctx: TenantContext, request: QuoteRequest): void {
    this.data.set(this.key(ctx, request.id), { ...request })
  }

  get(ctx: TenantContext, id: string): QuoteRequest | null {
    return this.data.get(this.key(ctx, id)) ?? null
  }

  list(ctx: TenantContext): QuoteRequest[] {
    const prefix = `${tenantIdOf(ctx)}:`
    const out: QuoteRequest[] = []
    for (const [k, v] of this.data) {
      if (k.startsWith(prefix)) out.push({ ...v })
    }
    return out
  }
}
