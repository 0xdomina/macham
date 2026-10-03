# Macham architecture

## Shape

```
                    ┌─────────────────────────┐
                    │      Macham core        │
                    │  types + seams + rules  │
                    └────────────┬────────────┘
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
   ┌─────────────────────────┐     ┌─────────────────────────┐
   │     Merchant engine     │     │      Buyer proxy        │
   │ seller guardrails       │────▶│ natural-language intent │
   │ bulk tiers, clearance,  │ sons│ vision/structured parse │
   │ shipping terms, caps    │     │ micro-frontend or       │
   │ deterministic approvals │     │ headless helper         │
   └────────────┬────────────┘     └────────────┬────────────┘
                │  negotiation protocol         │
                └──────────────┬────────────────┘
                               ▼
                 ┌─────────────────────────┐
                 │   settlement rails      │
                 │ PayPal Orders v2 +      │
                 │ capture / authorize     │
                 └─────────────────────────┘
```

Two heads, one protocol between them, settlement through real rails.
Assistants attach to seams, never to stores.

## Settlement (verified 2026-10-03)

One compliant model: **we are the merchant of record.** Guest buyers pay
by card on our checkout (PayPal ACDC hosted fields, no PayPal account
needed); sellers get paid out via Hyperwallet bank transfer after KYC.
No headless purchasing on third-party sites, no credential injection,
no pooled cards — marketplace ToS, card-network rules, and
money-transmitter law all forbid the proxy pattern, and balance-backed
virtual cards do not exist as an API (PayPal Key died in 2022).

- Take: Orders v2 create → approve → authorize → capture-within-tolerance.
  Charge USD (no NGN presentment). Verve-only cards decline — ask for
  Visa/Mastercard co-badged.
- Pay out: Hyperwallet bank transfer (NG = wire, days not minutes,
  KYC review first time). Batch small payouts: the flat fee dominates.
- Refunds: reversal lines first, new transfer second, both verified.

## Seams (already scaffolded)

- `StoreAdapter` (`src/adapters/types.ts`): list/get/search/categories.
  Later: carts, orders, customers, promotions read. A Shopify, Medusa,
  WooCommerce, or Jumia adapter implements the same interface.
- `AIProvider` (`src/providers/types.ts`): chat completion. Failover across
  providers lives above this seam.

## Lanes (in priority order)

1. **API lane (default).** Store adapters and catalog APIs (Channel3 for
   enrichment across retailers). Structured data beats scraping always.
2. **Search lane.** Self-hosted vector search for semantic inventory and
   negotiation history. Elastic Docker is free; pgvector/Qdrant are valid
   substitutes at small scale.
3. **Browser lane (read-only discovery only).** Public product pages on
   consenting stores, never credential entry, never third-party checkout.
   Escalate here on API 404/422/extraction failure — never as first resort.
4. **Voice lane.** Browser mic → STT → intent → TTS summary. Prototype on a
   lightweight loop, ship on a production loop (LiveKit-class).

## Partner integrations (status)

- **Channel3**: primary catalog enrichment + affiliate spine. Server-side key
  only. Reuse search/lookup/PDP; never re-scrape.
- **APIMatic**: publish the Macham contract as a context plugin; consume
  PayPal's plugin while building. Kills stale-doc hallucinations.
- **Postman**: collections are the contract artifact + demo evidence (mocks,
  tests, fork link). Free tier suffices.
- **AG Grid**: Community (MIT) tables for the transaction ledger; Enterprise
  AI Toolkit only if the scored demo needs NL-grid. Verify license cost
  before committing to Enterprise features.
- **Bryntum**: SKIP unless a scored timeline UI demands it — commercial
  license + OEM terms kill hackathon velocity. FullCalendar/vis-timeline
  cover the same demo.
- **Elastic**: self-hosted Docker for the build; hosted only for a
  production story.
- **Astropods**: blueprint target for deploy/governance; keep agent logic
  portable regardless.
- **Render vs InstaCloud**: Render for the hackathon deployment box
  (credits + live URL). InstaCloud proven with our backend (Dockerfile
  deploys, microVM, usage billing) as the standing alternative. Verify
  current free-tier terms before choosing the demo host.
- **Rialo L1**: audit trail + budget-guard only (DevNet live, testnet
  forming, mainnet not launched). Never claim on-chain delivery proof.
  See `docs/RESEARCH.md`.

## Money rule

Negotiate first, lock a quote, authorize (never capture-before-accept),
capture within tolerance, void and re-quote outside it. Client-reported
success is never payment proof. Full rail detail lives in the PayPal
track; the SDK exposes settled/failed/pending and nothing else.
