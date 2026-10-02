import test from "node:test"
import assert from "node:assert/strict"
import {
  Harness,
  MockProvider,
  advisePricing,
  pricingContract,
} from "../dist/index.js"

const STATS = { minMinor: 1000, medianMinor: 2000, maxMinor: 3000, currency: "NGN" }

function harness(reply) {
  return new Harness({
    tenantId: "platform-a",
    brain: new MockProvider("b", { Product: reply }),
    capabilities: [{ key: "pricing", effects: "none", contract: pricingContract }],
  })
}

test("advises inside the band", async () => {
  const out = await advisePricing(
    harness(JSON.stringify({ suggestedMinor: 2100, floorMinor: 1500, ceilingMinor: 2800, reasoning: "Median plus a little for quality." })),
    { title: "Tee", stats: STATS }
  )
  assert.equal(out.suggestedMinor, 2100)
  assert.equal(out.floorMinor, 1500)
})

test("cost floor and max cap clamp the model", async () => {
  const out = await advisePricing(
    harness(JSON.stringify({ suggestedMinor: 9000, floorMinor: 100, ceilingMinor: 9000, reasoning: "A very confident model overstating things here." })),
    { title: "Tee", costMinor: 1800, stats: STATS }
  )
  assert.ok(out.floorMinor >= 1818)
  assert.equal(out.ceilingMinor, 3000)
  assert.ok(out.suggestedMinor <= 3000)
})

test("rejects bad stats", async () => {
  await assert.rejects(
    advisePricing(harness("{}"), {
      title: "Tee",
      stats: { ...STATS, medianMinor: 0 },
    }),
    /positive/
  )
})
