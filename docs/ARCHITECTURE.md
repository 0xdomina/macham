# Macham architecture

## Shape

```
                    ┌─────────────────────────┐
                    │      Macham core        │
                    │  types + seams + rules  │
                    └────────────┬────────────┘
                                 ▼
                   ┌───────────────────────────┐
                   │       Buyer proxy         │
                   │ natural-language intent   │
                   │ grounded search + compare │
                   │ cart proposal (never      │
                   │ mutates) → human approve  │
                   └────────────┬──────────────┘
                                │  store read
                                ▼
                   ┌───────────────────────────┐
                   │   store-read lanes        │
                   │ UniversalAdapter (keyless)│
                   │ → Kernel (read-only)      │
                   │ → Channel3 enrichment     │
                   └────────────┬──────────────┘
                                │  locked total
                                ▼
                   ┌───────────────────────────┐
                   │   settlement rails        │
                   │ PayPal Orders v2          │
                   │ approve / authorize /     │
                   │ capture-within-tolerance  │
                   └───────────────────────────┘
```

One head. Macham is buyer-only: the store sets the price and Macham orders
it — no negotiation, no seller console. Assistants attach to seams, never
to stores.

## Settlement (verified 2026-10-03)

One compliant model: **Macham orders, the store fulfills.** Macham reads
the store's listed price, locks the exact total, and settles it through
PayPal Orders v2 with a human approving in between. No headless purchasing
on third-party sites, no credential injection, no pooled cards — marketplace
ToS, card-network rules, and money-transmitter law all forbid the proxy
pattern, and balance-backed virtual cards do not exist as an API (PayPal
Key died in 2022).

- Take: Orders v2 create → approve → authorize → capture-within-tolerance.
  Charge USD (no NGN presentment). Verve-only cards decline — ask for
  Visa/Mastercard co-badged.
- Refunds: reversal to the verified payer, both lines verified.

## Seams (already scaffolded)

- `StoreAdapter` (`src/adapters/types.ts`): list/get/search/categories.
  Later: carts, orders, customers, promotions read. A Shopify, Medusa,
  WooCommerce, or Jumia adapter implements the same interface.
- `AIProvider` (`src/providers/types.ts`): chat completion. Server-owned:
  merchants hold only their `mch_` key and call the assist endpoint
  (`src/providers/cloud.ts`); Groq/DeepSeek keys never leave our server.
  Failover across providers lives above this seam.

## Lanes (in priority order)

1. **API lane (default).** Store adapters and catalog APIs (Channel3 for
   enrichment across retailers). Structured data beats scraping always.
2. **Search lane.** Self-hosted vector search for semantic inventory and
   order history. Elastic Docker is free; pgvector/Qdrant are valid
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
- **Bryntum**: SKIP stands — the free tier is a 45-day evaluation trial
  (internal use only, production prohibited). No hackathon distribution
  grant exists. FullCalendar/vis-timeline cover the same demo.
- **Elastic**: `src/catalog/elastic.ts` — BM25 now, RRF hybrid when rows
  carry embeddings. Self-host Docker is free forever; Cloud trial is
  14 days, no card. Live proof needs Docker or the trial.
- **Astropods**: `astropods.yml` + `AGENT.md` ship blueprint-ready.
  Deploy and AI Gateway need their account.
- **Kernel**: `src/browser/kernel.ts` — read-only lane on the verified
  REST shapes (sessions, Playwright execute, delete). Live proof needs
  `KERNEL_API_KEY`.
- **Render vs InstaCloud**: Render for the hackathon deployment box
  (credits + live URL). InstaCloud proven with our backend (Dockerfile
  deploys, microVM, usage billing) as the standing alternative. Verify
  current free-tier terms before choosing the demo host.
- **Rialo L1**: audit trail + budget-guard only (DevNet live, testnet
  forming, mainnet not launched). Never claim on-chain delivery proof.
  Verified live on devnet in `src/settlement/rialo.ts`.

## Money rule

Lock the exact total from the live read, then authorize (never
capture-before-accept), capture within tolerance, void if it drifts outside
it. Client-reported
success is never payment proof. Full rail detail lives in the PayPal
track; the SDK exposes settled/failed/pending and nothing else.
