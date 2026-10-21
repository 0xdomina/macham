# Macham feature map

Status legend: DONE · NEXT · LATER. Build order is binding unless
re-scoped in writing. Anti-scope at the bottom is equally binding.

## DONE

- Seams: `StoreAdapter`, `AIProvider`, shared types, mock store,
  zero-code `UniversalAdapter` (shopify · woo · json-ld), server-owned
  Groq/DeepSeek clients, cloud brain, assist gateway with keystore and
  metering. Tests green.
- Doctrine: `ARCHITECTURE.md`, `UI_SYSTEM.md`, `AI_FEATURES.md`,
  `KEYS.md`, `MASCOT.md`, `LANDING.md`, `INTEGRATION.md`.
- Tenancy wall: context, namespaced stores, per-tenant router, harness
  tenant gate. Cross-tenant reads miss by construction (tested).
- Buyer proxy: intent, search/compare, cart proposals, threaded chat.
  Macham is buyer-only: the store sets the price, Macham orders it.
- Platform: `mch_` keys, billing gates, single-line loader, embeddable
  widget, PayPal rail, Channel3 + Kernel discovery lanes, Rialo audit layer.
- Marketing site, Postman collection, submission checklist. (Standalone demo
  app removed; the widget ships via snippet / SDK / extension.)
- 43/43 tests green. No fabricated data anywhere.

## NEXT (in order)

1. **Buyer proxy polish** (intent → search/compare → cart proposal → chat)
   per `AI_FEATURES.md`.
2. **Checkout execution (PayPal sandbox).** Locked total → Orders v2 create
   → approve → authorize → capture-within-tolerance → receipt + refund path.
   Files: `src/rails/paypal.ts`, Postman collection.
3. **Catalog enrichment lane.** Channel3 search/lookup plus the read-only
   Kernel browser fallback, behind the adapter seam (server key only).
   Files: `src/catalog/channel3.ts`, `src/browser/kernel.ts`.
4. **Ledger dashboard** (`UI_SYSTEM.md` tokens) + approval queue with
   Undo + audit.
5. **Voice loop.** Mic → intent → summary TTS on the buyer
   micro-frontend.

## LATER

- Shipping-terms handling (Incoterms, split shipments) for physical goods,
  buyer onboarding flows, demo video script. (The browser discovery lane and
  Kernel fallback are already shipped.)
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

- Any seller console, RFQ/negotiation engine, or bulk-tier pricing. Macham
  is buyer-only; the store's listed price is the price.
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
