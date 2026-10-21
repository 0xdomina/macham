// Server-side capability registry. Every hosted brain call passes the
// safety Harness: reader allowlist, contracts, text filter, proposal-only
// effects. Callers send data, never model keys. Nothing here mutates money,
// carts, or inventory. Failures are never billed. Macham is buyer-only:
// fixed prices, no negotiation, no seller console.

import { Harness } from "../dist/safety/harness.js"
import { SEARCH_CAPABILITY, COMPARE_CAPABILITY, CART_PROPOSAL_CAPABILITY, searchContract, cartProposalContract } from "../dist/buyer/shop.js"

const JSON_ONLY = "Reply with JSON only. No prose outside the object."

function dataBlock(contextJson) {
  return `DATA (caller-supplied, the only numbers you may use):\n${contextJson}`
}

const CAPABILITIES = {
  [SEARCH_CAPABILITY]: {
    contract: searchContract,
    effects: "none",
    system: (c) => `Present catalog matches for the shopper. Reply JSON {"summary": string}. ${JSON_ONLY} Numbers only from DATA. Never invent stock or prices.\n${dataBlock(c)}`,
  },
  [COMPARE_CAPABILITY]: {
    contract: searchContract,
    effects: "none",
    system: (c) => `Compare the DATA offers for the shopper. Reply JSON {"summary": string}. ${JSON_ONLY} Compare only listed offers. Never invent.\n${dataBlock(c)}`,
  },
  [CART_PROPOSAL_CAPABILITY]: {
    contract: cartProposalContract,
    effects: "proposal",
    system: (c) => `Propose exactly one cart action. Reply JSON {"action": "add" or "remove", "productId": string, "title": string, "qty": 1-99, "reason": string}. ${JSON_ONLY} Propose, never mutate.\n${dataBlock(c)}`,
  },
}

export function capabilityNames() {
  return Object.keys(CAPABILITIES)
}

/** Run one capability through the Harness. Throws short errors. */
export async function runCapability(brain, tenantId, capability, input, context) {
  const def = CAPABILITIES[capability]
  if (!def) {
    const err = new Error("Unknown capability.")
    err.status = 400
    throw err
  }
  const text = String(input ?? "").slice(0, 2000)
  if (!text.trim()) throw Object.assign(new Error("Input needed."), { status: 400 })
  let contextJson = "{}"
  if (context !== undefined) {
    const raw = JSON.stringify(context) ?? "{}"
    if (raw.length > 16384) throw Object.assign(new Error("Context too large."), { status: 400 })
    contextJson = raw
  }
  const harness = new Harness({
    tenantId,
    brain,
    capabilities: [{ key: capability, effects: def.effects, contract: def.contract }],
  })
  const value = await harness.run(capability, () => ({
    system: def.system(contextJson),
    user: text,
  }))
  return value
}
