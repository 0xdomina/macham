// Backend-only settlement audit seam over the Rialo anchor. This lives in
// server/, never in the browser SDK, so `@rialo/ts-cdk`, `process.env`, and
// the funding key stay on the server. Every function is fail-closed: an audit
// problem can never break or block the money path, and never throws.

import {
  isRialoAuditConfigured,
  appendAuditEvent,
  readAuditEvents,
} from "../dist/settlement/rialo.js"

/** Which Rialo network writes/reads target, for honest display. */
export function settlementNetwork() {
  const raw = (process.env.RIALO_NETWORK ?? "testnet").trim().toLowerCase()
  return raw === "devnet" ? "devnet" : "testnet"
}

/** True when audit writes are enabled AND a usable key is present. */
export function settlementWritesEnabled() {
  try {
    return isRialoAuditConfigured()
  } catch {
    return false
  }
}

/**
 * Best-effort anchor of one settlement event. Returns the shape the routes
 * expose; never throws and never rejects, so callers can fire-and-forget.
 */
export async function anchorSettlement(event) {
  try {
    const signature = await appendAuditEvent(event)
    return { enabled: settlementWritesEnabled(), anchored: Boolean(signature), signature }
  } catch {
    return { enabled: false, anchored: false, signature: null }
  }
}

/** Read anchored events for a reference. Fail-closed to an empty list. */
export async function readSettlementAudit(ref) {
  const network = settlementNetwork()
  try {
    const events = await readAuditEvents(String(ref ?? ""))
    return { network, events: Array.isArray(events) ? events : [] }
  } catch {
    return { network, events: [] }
  }
}

/** Shape a caller-supplied anchor body into a valid event, defensively. */
export function anchorEventFromBody(body) {
  const b = body && typeof body === "object" ? body : {}
  const event = {
    kind: String(b.kind ?? "").slice(0, 64),
    ref: String(b.ref ?? "").slice(0, 160),
  }
  if (typeof b.actor === "string") event.actor = b.actor.slice(0, 320)
  if (b.payload && typeof b.payload === "object" && !Array.isArray(b.payload)) {
    event.payload = b.payload
  }
  return event
}
