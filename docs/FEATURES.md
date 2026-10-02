# Macham feature map

Status legend: DONE · NEXT · LATER. Build order is binding unless
re-scoped in writing. Anti-scope at the bottom is equally binding.

## DONE

- Seams: `StoreAdapter`, `AIProvider`, shared types, mock store,
  OpenAI-compatible client (Groq, DeepSeek). Tests green.
- Doctrine: `ARCHITECTURE.md`, `STANDARDS.md`, `UI_SYSTEM.md`,
  `AI_FEATURES.md`, `RESEARCH.md`.

## NEXT (in order)

0. **Safety harness + provider router + mock double.** Before any
   assistant. See `AI_FEATURES.md`.
1. **Bulk-tier engine.** Qty break tables per SKU (min, tiers, value vs
   unit MOQ). Auto price from table. Below-MOQ: priced premium or reject
   with next-tier nudge. Files: `src/negotiation/tiers.ts`, tests.
2. **RFQ/quote object.** Draft → In Review → Approved → Presented →
   Accepted → Expired. Buyer posts specs/qty/ship-to; seller side
   counters with expiry, MOQ, lead time. Files: `src/negotiation/quote.ts`.
3. **Guardrail engine.** Floor margin, max % off without approval, MAP
   per brand, approval chain by amount/category/risk. Model proposes,
   rules dispose. Every concession logged. Files: `src/negotiation/guardrails.ts`.
4. **Seller engine caps** (listing, pricing, insights, accounting,
   marketing, brief, recommendations) per `AI_FEATURES.md`.
5. **Buyer proxy** (intent → search/compare → cart proposal → chat)
   per `AI_FEATURES.md`.
6. **Checkout execution (PayPal sandbox).** Quote → Orders v2 create →
   approve → authorize → capture-within-tolerance → receipt + refund
   path. Files: `src/rails/paypal.ts`, Postman collection.
7. **Catalog enrichment lane.** Channel3 search/lookup behind the
   adapter seam (server key only). Files: `src/catalog/channel3.ts`.
8. **Ledger dashboard** (`UI_SYSTEM.md` tokens) + approval queue with
   Undo + audit.
9. **Voice loop.** Mic → intent → summary TTS on the buyer
   micro-frontend.

## LATER

- Buyer widget snippet (`Assistant` bubble per `MASCOT.md`) + mascot
  config (tiers, tone mapping).
- Multi-supplier RFQ broadcast, CPQ-style approval chains, shipping-terms
  negotiation (Incoterms, split shipments), Rialo audit anchoring,
  browser fallback lane, seller/buyer onboarding flows, demo video script.

## Anti-scope (do NOT build)

- Open haggling on fixed-price B2C goods.
- Agent-set prices without a price book or tier table.
- Advertised prices below MAP, including via stacked coupons.
- Auto-accept below cost or floor.
- Instant capture on handshake/chat deals without verification.
- Bundled freebies masking a MAP violation.
- AI-decided approval routing (policy code decides; AI summarizes).
- Mainnet money, EVM redeploys, or delivery-proof claims on Rialo.
- Bryntum unless a scored timeline UI requires it (license cost).
