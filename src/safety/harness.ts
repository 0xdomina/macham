import type { AIProvider } from "../providers/types.js"

// Safety harness: the single chokepoint every capability passes.
// Registry + reader allowlist + contracts + text filter + proposal-only
// side effects. No capability runs outside it.

export type EffectPolicy = "none" | "proposal"

export type CapabilityDef = {
  key: string
  effects: EffectPolicy
  // JSON-schema-lite contract for the capability output.
  contract: Contract
}

export type Contract =
  | { type: "string"; minLength?: number; maxLength?: number }
  | { type: "number"; min?: number; max?: number }
  | { type: "boolean" }
  | { type: "object"; fields: Record<string, Contract>; required?: string[] }
  | { type: "array"; items: Contract; maxItems?: number }

export type CheckResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string }

export function checkContract(contract: Contract, value: unknown): CheckResult {
  switch (contract.type) {
    case "string":
      if (typeof value !== "string") return { ok: false, reason: "Not text." };
      if (contract.minLength != null && value.length < contract.minLength) {
        return { ok: false, reason: "Text too short." }
      }
      if (contract.maxLength != null && value.length > contract.maxLength) {
        return { ok: false, reason: "Text too long." }
      }
      return { ok: true, value }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, reason: "Not a number." }
      }
      if (contract.min != null && value < contract.min) {
        return { ok: false, reason: "Number too small." }
      }
      if (contract.max != null && value > contract.max) {
        return { ok: false, reason: "Number too large." }
      }
      return { ok: true, value }
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true, value }
        : { ok: false, reason: "Not yes or no." }
    case "array":
      if (!Array.isArray(value)) return { ok: false, reason: "Not a list." }
      if (contract.maxItems != null && value.length > contract.maxItems) {
        return { ok: false, reason: "List too long." }
      }
      for (const item of value) {
        const r = checkContract(contract.items, item)
        if (!r.ok) return r
      }
      return { ok: true, value }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, reason: "Not an object." }
      }
      const record = value as Record<string, unknown>
      for (const key of contract.required ?? []) {
        if (!(key in record)) return { ok: false, reason: `Missing ${key}.` }
      }
      const out: Record<string, unknown> = {}
      for (const [key, sub] of Object.entries(contract.fields)) {
        if (!(key in record)) continue
        const r = checkContract(sub, record[key])
        if (!r.ok) return { ok: false, reason: `${key}: ${r.reason}` }
        out[key] = r.value
      }
      return { ok: true, value: out }
    }
  }
}

const PII_RE =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{13,19}\b/i

// Text leaving toward a model must carry no contact details or card
// numbers. Fails closed: flag and refuse.
export function scrubText(text: string): CheckResult {
  if (PII_RE.test(text)) return { ok: false, reason: "Remove contact details first." }
  return { ok: true, value: text }
}

export type HarnessOptions = {
  capabilities: CapabilityDef[]
  brain: AIProvider
  // Tenant scope is mandatory: readers are host-injected per tenant, and
  // the harness refuses to run without knowing whose data it guards.
  tenantId: string
  // Readers the model may see (catalog JSON, aggregates). Unknown keys refuse.
  readers?: Record<string, () => Promise<unknown>>
}

export class Harness {
  private readonly caps: Map<string, CapabilityDef>
  private readonly brain: AIProvider
  private readonly readers: Record<string, () => Promise<unknown>>
  readonly tenantId: string

  constructor(opts: HarnessOptions) {
    const id = (opts.tenantId ?? "").trim()
    if (!id) throw new Error("Tenant needed.")
    this.tenantId = id
    this.caps = new Map(opts.capabilities.map((c) => [c.key, c]))
    this.brain = opts.brain
    this.readers = opts.readers ?? {}
  }

  has(key: string): boolean {
    return this.caps.has(key)
  }

  async read(key: string): Promise<unknown> {
    const reader = this.readers[key]
    if (!reader) throw new Error("Unknown reader.")
    return reader()
  }

  // Run a capability: validate output against its contract, enforce the
  // effect policy. Direct mutations never happen here — proposal objects
  // return to the host, which applies them through its own rails.
  async run<T>(key: string, buildPrompt: () => { system: string; user: string }): Promise<T> {
    const cap = this.caps.get(key)
    if (!cap) throw new Error("Unknown capability.")
    const { system, user } = buildPrompt()
    const clean = scrubText(`${system}\n${user}`)
    if (!clean.ok) throw new Error(clean.reason)
    const reply = await this.brain.chat([
      { role: "system", content: system },
      { role: "user", content: user },
    ])
    let parsed: unknown = reply.text
    try {
      parsed = JSON.parse(reply.text)
    } catch {
      // Prose stands when the contract accepts text.
    }
    const checked = checkContract(cap.contract, parsed)
    if (!checked.ok) throw new Error(checked.reason)
    return checked.value as T
  }
}
