# Macham feature map

Status legend: DONE · NEXT · LATER. Build order is binding unless
re-scoped in writing. Anti-scope at the bottom is equally binding.

## DONE

- Seams: `StoreAdapter`, `AIProvider`, shared types, mock store,
  OpenAI-compatible client (Groq, DeepSeek). Tests green.
- Doctrine: `ARCHITECTURE.md`, `STANDARDS.md`, `UI_SYSTEM.md`,
  `AI_FEATURES.md`, `RESEARCH.md`, `KEYS.md`, `MASCOT.md`, `LANDING.md`,
  `INTEGRATION.md`.
- Tenancy wall: context, namespaced stores, per-tenant router, harness
  tenant gate. Cross-tenant reads miss by construction (tested).
- Negotiation: bulk tiers, RFQ lifecycle, guardrails (floors, MAP,
  approvals, audit).
- Seller caps: listing, pricing, insights, accounting, marketing,
  brief, deterministic ranker.
- Buyer proxy: intent, search/compare, cart proposals, threaded chat.
- Platform: `mch_` keys, billing gates, single-line loader, embeddable
  widget, PayPal rail, Channel3 lane, Rialo audit layer.
- Demo app, marketing site, Postman collection, submission checklist.
- 56/56 tests green. No fabricated data anywhere.

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

- Multi-supplier RFQ broadcast, CPQ-style approval chains, shipping-terms
  negotiation (Incoterms, split shipments), browser fallback lane,
  seller/buyer onboarding flows, demo video script.
- Budget-guard contract on Rialo testnet (cap plus allowlist plus timer
  refund). Audit trail ships in `src/settlement/rialo.ts`. Verify timers
  on testnet before claiming guard behavior.

## Hardening sprint (production-grade, in order)

1. Sandbox keys → live PayPal loop on video.
2. Postgres `TenantStore` + `KeyStore` (rotation with grace, revocation
   list) + scope check in `Harness.run`.
3. User JWT mint/verify (short expiry, deny-list) or cut the claim.
4. Per-key rate limiter (429s) + retry-with-jitter on 429/5xx.
5. Request IDs, structured logs, persisted audit, `/health`.
6. CHANGELOG + versioning policy.

## Non-integrated store access (mobile-first, no scraping, no auto-buy)

Stores that never integrate are reached, never entered: native Share
(iOS extension + Android intent) plus paste-box plus affiliate-wrapped
buy links. No accessibility automation, no credential injection, no
Universal-Link hijacking. PWA share-target is an Android enhancement
only. Monetize via affiliate commissions on the handoff.

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
- Headless proxy purchasing on third-party stores, credential injection
  into foreign checkouts, pooled/virtual cards from balances. ToS breach,
  network breach, unlicensed transmission in three regimes.
