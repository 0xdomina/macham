import test from "node:test"
import assert from "node:assert/strict"
import {
  Harness,
  MockProvider,
  accountingContract,
  askInsights,
  insightsContract,
  writeAccountingDigest,
} from "../dist/index.js"

function harness(capability, contract, reply) {
  return new Harness({
    tenantId: "platform-a",
    brain: new MockProvider("b", { Snapshot: reply, Currency: reply }),
    capabilities: [{ key: capability, effects: "none", contract }],
  })
}

test("insights answers from snapshot, refuses thin questions", async () => {
  const out = await askInsights(
    harness("insights", insightsContract, '{"answer":"July beat June.","unanswerable":false}'),
    {
      question: "Which month sold more?",
      snapshot: { totals: { june: 5, july: 9 } },
    }
  )
  assert.equal(out.answer, "July beat June.")
  await assert.rejects(
    askInsights(harness("insights", insightsContract, "{}"), {
      question: "hi",
      snapshot: {},
    }),
    /fuller/
  )
})

test("digest narrates caller totals", async () => {
  const out = await writeAccountingDigest(
    harness("accounting", accountingContract, '{"digest":"Net stayed strong after commission this month."}'),
    {
      aggregates: { currency: "NGN", grossMinor: 100000, commissionMinor: 5000, netMinor: 95000 },
    }
  )
  assert.equal(out.digest, "Net stayed strong after commission this month.")
  await assert.rejects(
    writeAccountingDigest(harness("accounting", accountingContract, "{}"), {
      aggregates: { currency: "NGN", grossMinor: -1, commissionMinor: 0, netMinor: 0 },
    }),
    /zero or more/
  )
})
