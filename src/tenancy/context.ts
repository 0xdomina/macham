// Multi-tenancy: platforms A, B, C, D are separate organizations with
// millions of users each. Isolation is structural, not conventional:
//
// - Every engine call carries an explicit tenant scope. No ambient tenant.
// - Shared singletons hold NO tenant data. Router stickiness is keyed per
//   tenant (performance only, still namespaced).
// - Stored records are namespaced `tenantId:key` at the storage seam, so a
//   wrong-tenant read is a miss by construction, never a leak.

export type TenantContext = {
  /** Platform id: jumia, shopify-store-42, ... Never user input raw. */
  tenantId: string
  /** End user or staff actor inside the tenant. Optional for anonymous. */
  actorId?: string
}

export function tenantIdOf(ctx: TenantContext): string {
  const id = (ctx?.tenantId ?? "").trim()
  if (!id || id.length > 128 || /[#"'\s]/.test(id)) {
    throw new Error("Tenant needed.")
  }
  return id
}

/** Namespaced key-value seam. Hosts implement over Redis/Postgres. */
export type TenantStore = {
  get(tenantId: string, key: string): Promise<string | null>
  set(tenantId: string, key: string, value: string): Promise<void>
  del(tenantId: string, key: string): Promise<void>
}

export function namespaced(tenantId: string, key: string): string {
  return `${tenantId}:${key}`
}

/** Ephemeral in-memory store. Process restarts wipe it. Never production. */
export class MemoryTenantStore implements TenantStore {
  private readonly data = new Map<string, string>()

  async get(tenantId: string, key: string): Promise<string | null> {
    return this.data.get(namespaced(tenantIdOf({ tenantId }), key)) ?? null
  }

  async set(tenantId: string, key: string, value: string): Promise<void> {
    this.data.set(namespaced(tenantIdOf({ tenantId }), key), value)
  }

  async del(tenantId: string, key: string): Promise<void> {
    this.data.delete(namespaced(tenantIdOf({ tenantId }), key))
  }
}
