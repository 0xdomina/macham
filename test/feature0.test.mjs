import test from "node:test"
import assert from "node:assert/strict"
import {
  Harness,
  MockProvider,
  ProviderRouter,
  ProviderUnavailableError,
  checkContract,
  resolveIdentity,
  scrubText,
} from "../dist/index.js"

test("router sticks to last success and fails over", async () => {
  const flaky = new MockProvider("flaky", {}, true)
  const steady = new MockProvider("steady", { hi: "hello" })
  const router = new ProviderRouter({ providers: [flaky, steady] })
  const first = await router.chat([{ role: "user", content: "hi" }])
  assert.equal(first.text, "hello")
  assert.equal(first.model, "assistant")
  const second = await router.chat([{ role: "user", content: "hi again" }])
  assert.equal(second.text, "hello")
})

test("router throws when everything fails", async () => {
  const router = new ProviderRouter({
    providers: [new MockProvider("a", {}, true), new MockProvider("b", {}, true)],
  })
  await assert.rejects(router.chat([{ role: "user", content: "x" }]), (e) => {
    assert.ok(e instanceof ProviderUnavailableError)
    assert.deepEqual(e.failedProviders, ["a", "b"])
    return true
  })
})

test("contracts accept good shapes and refuse bad ones", () => {
  const contract = {
    type: "object",
    required: ["title"],
    fields: {
      title: { type: "string", minLength: 2 },
      price: { type: "number", min: 0 },
    },
  }
  assert.deepEqual(checkContract(contract, { title: "Tee", price: 9 }).value, {
    title: "Tee",
    price: 9,
  })
  assert.equal(checkContract(contract, { price: 9 }).ok, false)
  assert.equal(checkContract(contract, { title: "x", price: -1 }).ok, false)
})

test("scrubber refuses contact details", () => {
  assert.equal(scrubText("call me at joe@example.com").ok, false)
  assert.equal(scrubText("a plain question").ok, true)
})

test("harness runs a capability through its contract", async () => {
  const brain = new MockProvider("b", { write: '{"title":"Nice Tee"}' })
  const harness = new Harness({
    tenantId: "platform-a",
    brain,
    capabilities: [
      {
        key: "listing",
        effects: "none",
        contract: { type: "object", required: ["title"], fields: { title: { type: "string" } } },
      },
    ],
  })
  assert.ok(harness.has("listing"))
  assert.ok(!harness.has("nope"))
  const out = await harness.run("listing", () => ({
    system: "Write.",
    user: "write",
  }))
  assert.deepEqual(out, { title: "Nice Tee" })
  await assert.rejects(
    harness.run("missing", () => ({ system: "s", user: "u" })),
    /Unknown capability/
  )
})

test("identity resolves names, tones, and disclosure", () => {
  const custom = resolveIdentity({ name: "Ada", tone: "precise" })
  assert.equal(custom.name, "Ada")
  assert.equal(custom.disclosure, "AI assistant")
  assert.equal(resolveIdentity({}).name, "Shop helper")
  assert.equal(resolveIdentity({ name: "  " }).name, "Shop helper")
})
