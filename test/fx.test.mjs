import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { estimateLabel, estimateNote, loadRates } from "../dist/buyer/fx.js"

// Macham does not hold the money: the store charges, and PayPal converts. So an
// FX figure here is an estimate, shown only when the host supplies a rate, and
// always next to the price the store will actually charge.

const product = (currency, amountMinor) => ({
  id: "p1",
  title: "A Letter Gold Necklace",
  price: { amountMinor, currency },
})

describe("macham fx estimates", () => {
  it("labels an estimate in the shopper's currency", async () => {
    const fx = { currency: "USD", rate: async (from, to) => (from === "TRY" && to === "USD" ? 0.02336 : null) }
    const rates = await loadRates([product("TRY", 185000)], fx)
    assert.equal(estimateLabel(product("TRY", 185000), fx, rates), "\u2248 USD 43.22")
  })

  it("shows nothing when the host has no rate, rather than inventing one", async () => {
    const fx = { currency: "USD", rate: () => null }
    const rates = await loadRates([product("TRY", 185000)], fx)
    assert.equal(estimateLabel(product("TRY", 185000), fx, rates), null)
    assert.equal(estimateLabel(product("TRY", 185000), undefined, new Map()), null)
  })

  it("does not call a store in the shopper's own currency an estimate", async () => {
    let called = 0
    const fx = { currency: "USD", rate: () => { called++; return 1 } }
    const rates = await loadRates([product("USD", 4300)], fx)
    assert.equal(called, 0, "no lookup for the same currency")
    assert.equal(estimateLabel(product("USD", 4300), fx, rates), null)
  })

  it("survives a rate provider that throws", async () => {
    const fx = { currency: "USD", rate: () => { throw new Error("rates down") } }
    const rates = await loadRates([product("TRY", 185000), product("NGN", 500000)], fx)
    assert.equal(rates.size, 0)
    assert.equal(estimateLabel(product("TRY", 185000), fx, rates), null)
  })

  it("keeps the estimate honest about what the store charges", () => {
    assert.match(estimateNote(product("TRY", 185000)), /charges TRY/)
    assert.match(estimateNote(product("TRY", 185000)), /Estimate only/)
  })
})
