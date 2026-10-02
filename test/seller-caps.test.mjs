import test from "node:test"
import assert from "node:assert/strict"
import {
  Harness,
  MockProvider,
  coachMarketing,
  marketingContract,
  rankOpportunities,
  briefContract,
  writeBrief,
} from "../dist/index.js"

function harness(capability, contract, reply) {
  return new Harness({
    tenantId: "platform-a",
    brain: new MockProvider("b", { Catalog: reply, Revenue: reply }),
    capabilities: [{ key: capability, effects: "none", contract }],
  })
}

test("marketing ideas reference real products only", async () => {
  const catalog = [
    { id: "a", title: "Tee" },
    { id: "b", title: "Cap" },
  ]
  const out = await coachMarketing(
    harness(
      "marketing",
      marketingContract,
      '{"ideas":[{"title":"Bundle week","action":"Pair the tee with the cap.","productIds":["a","b"]}]}'
    ),
    { goal: "Move slow stock this month", catalog }
  )
  assert.equal(out.ideas[0].title, "Bundle week")
  await assert.rejects(
    coachMarketing(
      harness(
        "marketing",
        marketingContract,
        '{"ideas":[{"title":"Ghost sale","action":"Sell what does not exist here.","productIds":["zzz"]}]}'
      ),
      { goal: "Move slow stock this month", catalog }
    ),
    /Unknown product/
  )
  await assert.rejects(
    coachMarketing(harness("marketing", marketingContract, "{}"), {
      goal: "short",
      catalog,
    }),
    /goal/
  )
})

test("brief narrates caller numbers", async () => {
  const reply = '{"brief":"Revenue held steady across twelve orders this week with caps leading and two lines nearly out."}'
  const h = new Harness({
    tenantId: "platform-a",
    brain: new MockProvider("b", { currency: reply }),
    capabilities: [{ key: "brief", effects: "none", contract: briefContract }],
  })
  const out = await writeBrief(h,
    {
      numbers: {
        currency: "NGN",
        revenueMinor: 120000,
        orders: 12,
        topMovers: [{ id: "a", title: "Cap", qty: 8 }],
        lowStock: [{ id: "b", title: "Tee", left: 2 }],
      },
    }
  )
  assert.match(out.brief, /twelve orders/)
})

test("ranker orders without a model", () => {
  const ranked = rankOpportunities([
    { id: "a", title: "Slow", marginPct: 10, salesLast30d: 1, stockLeft: 50 },
    { id: "b", title: "Hot", marginPct: 50, salesLast30d: 20, stockLeft: 30 },
    { id: "c", title: "Scarce", marginPct: 20, salesLast30d: 5, stockLeft: 2 },
  ])
  assert.equal(ranked[0].id, "b")
  assert.equal(ranked[0].kind, "price_uplift")
  assert.equal(ranked.find((r) => r.id === "c").kind, "win_back")
})
