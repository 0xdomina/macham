import test from "node:test"
import assert from "node:assert/strict"
import {
  Harness,
  MockProvider,
  MockStoreAdapter,
  cartProposalContract,
  chatTurn,
  searchContract,
  trimHistory,
} from "../dist/index.js"

function harness() {
  return new Harness({
    tenantId: "platform-a",
    brain: new MockProvider("b", {
      Matches: '{"summary":"Two options."}',
      tee: '{"summary":"Tee found."}',
    }),
    capabilities: [
      { key: "buyer_search", effects: "none", contract: searchContract },
      { key: "buyer_compare", effects: "none", contract: searchContract },
      { key: "buyer_cart_proposal", effects: "none", contract: cartProposalContract },
    ],
  })
}

test("chat routes cart, search, and fallback", async () => {
  const store = new MockStoreAdapter()
  const h = harness()
  const added = await chatTurn(h, store, [], "add a cap to my bag")
  assert.equal(added.reply.intent, "cart_add")
  assert.match(added.reply.text, /Add 1/)
  assert.equal(added.reply.proposal.action, "add")
  assert.equal(added.history.length, 2)
  const found = await chatTurn(h, store, added.history, "show me tees")
  assert.equal(found.reply.intent, "product_search")
  const general = await chatTurn(h, store, [], "hello there friend")
  assert.equal(general.reply.intent, "general")
  await assert.rejects(chatTurn(h, store, [], "   "), /Message needed/)
})

test("history stays bounded", () => {
  const long = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    text: `m${i}`,
  }))
  const trimmed = trimHistory(long)
  assert.equal(trimmed.length, 40)
  assert.equal(trimmed[0].text, "m60")
})
