import test from "node:test"
import assert from "node:assert/strict"
import {
  Harness,
  MockProvider,
  listingContract,
  writeListing,
} from "../dist/index.js"

function harness(reply) {
  return new Harness({
    tenantId: "platform-a",
    brain: new MockProvider("b", { "Notes:": reply }),
    capabilities: [{ key: "listing", effects: "none", contract: listingContract }],
  })
}

const GOOD = JSON.stringify({
  title: "Handwoven Tote",
  description: "A roomy handwoven tote for market days and beach trips alike.",
  tags: ["tote", "woven"],
  seo_title: "Handwoven Tote",
  seo_description: "Roomy handwoven tote.",
})

test("writes a structured listing", async () => {
  const out = await writeListing(harness(GOOD), {
    notes: "woven tote bag, roomy, market days",
    category: "bags",
  })
  assert.equal(out.title, "Handwoven Tote")
  assert.deepEqual(out.tags, ["tote", "woven"])
})

test("refuses thin notes and bad shapes", async () => {
  await assert.rejects(
    writeListing(harness(GOOD), { notes: "bag" }),
    /Describe the product/
  )
  await assert.rejects(
    writeListing(harness('{"title":"x"}'), { notes: "a proper long note here" }),
    /description/
  )
})
