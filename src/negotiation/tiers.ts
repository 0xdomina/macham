import { tenantIdOf, type TenantContext } from "../tenancy/context.js"

// Bulk-tier pricing. Discount is a function of quantity, known before any
// chat happens — never invented mid-negotiation. Tables are tenant-scoped:
// platform A's tiers are invisible to platform B by construction.

export type PriceTier = {
  /** Minimum quantity where this unit price applies. */
  minQty: number
  /** Minor units per unit at this tier. */
  unitMinor: number
}

export type TierTable = {
  sku: string
  /** Absolute minimum order quantity. Below it: premium or reject. */
  minQty: number
  tiers: PriceTier[]
  currency: string
}

export type PriceOutcome =
  | { ok: true; unitMinor: number; tierMinQty: number; currency: string }
  | { ok: false; reason: "below_minimum" | "no_table"; atQty: number; minQty?: number }

export function validateTable(table: TierTable): void {
  if (!table.sku.trim()) throw new Error("SKU needed.")
  if (!Number.isInteger(table.minQty) || table.minQty < 1) {
    throw new Error("Minimum must be 1 or more.")
  }
  if (!table.tiers.length) throw new Error("Tiers needed.")
  const sorted = [...table.tiers].sort((a, b) => a.minQty - b.minQty)
  for (const t of sorted) {
    if (!Number.isInteger(t.minQty) || t.minQty < 1) {
      throw new Error("Tier quantity must be 1 or more.")
    }
    if (!Number.isFinite(t.unitMinor) || t.unitMinor <= 0) {
      throw new Error("Tier price must be positive.")
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].unitMinor > sorted[i - 1].unitMinor) {
      throw new Error("Bigger orders cost less, never more.")
    }
  }
}

/** Price a quantity. Pure function — no store, no network, no leakage. */
export function priceFor(table: TierTable, qty: number): PriceOutcome {
  if (!Number.isInteger(qty) || qty < 1) {
    return { ok: false, reason: "below_minimum", atQty: qty, minQty: table.minQty }
  }
  if (qty < table.minQty) {
    return { ok: false, reason: "below_minimum", atQty: qty, minQty: table.minQty }
  }
  const sorted = [...table.tiers].sort((a, b) => a.minQty - b.minQty)
  let active = sorted[0]
  for (const tier of sorted) {
    if (qty >= tier.minQty) active = tier
  }
  return { ok: true, unitMinor: active.unitMinor, tierMinQty: active.minQty, currency: table.currency }
}

/** In-memory tier registry. Namespaced per tenant; hosts swap in DB storage. */
export class TierRegistry {
  private readonly tables = new Map<string, TierTable>()

  private key(ctx: TenantContext, sku: string): string {
    return `${tenantIdOf(ctx)}:${sku.trim().toLowerCase()}`
  }

  set(ctx: TenantContext, table: TierTable): void {
    validateTable(table)
    this.tables.set(this.key(ctx, table.sku), { ...table })
  }

  get(ctx: TenantContext, sku: string): TierTable | null {
    return this.tables.get(this.key(ctx, sku)) ?? null
  }

  price(ctx: TenantContext, sku: string, qty: number): PriceOutcome {
    const table = this.get(ctx, sku)
    if (!table) return { ok: false, reason: "no_table", atQty: qty }
    return priceFor(table, qty)
  }
}
