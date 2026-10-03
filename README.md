# Macham

Every store gets an assistant. Every shopper gets answers.

A shopper types "warm jackets under ₦50,000". Macham finds them across
real catalogs, compares prices, proposes the bag, and settles through
PayPal. Sellers get the same brain for listings, pricing, and stock
questions. One snippet drops it into any store.

## See it work (60 seconds)

```bash
cd demo && npm install && npm run dev
```

Open the page. Search a product. Ask the chat. Approve a proposal.
Watch the ledger record it. No account, no keys, no setup.

## What it does

- **Shoppers:** search, compare, cart proposals, order tracking, voice
  input. Numbers always come from live catalogs, never invented.
- **Sellers:** listing writer, price advisor, insights, accounting
  digest, marketing ideas, daily brief. Aggregates in, guidance out.
- **Checkout:** quote, approve, authorize, capture within tolerance,
  receipt, refund path. Outside tolerance voids and re-quotes.
  Capture stays within tolerance or re-quotes. Refunds return to the
  verified payer.

## How it stays honest

- Fixed prices never get haggled. Negotiation lives in bulk tiers,
  clearance, and shipping — inside merchant guardrails, every
  concession logged.
- AI proposes. Humans approve. Money moves on rails, not on words.
- Platforms never see each other. Tenants, users, and histories are
  partitioned by construction and proven by tests.

## Built with

| Layer | Choice |
|---|---|
| Payments | PayPal Orders v2 (sandbox-first), Agent Toolkit patterns |
| Catalog | Channel3 API, server key only |
| Tables | AG Grid Community |
| Contracts | Postman collections with mocks |
| Voice | Browser speech APIs, zero vendors |

## Next

Live sandbox money loop on video. APIMatic plugin from the contract.
Elastic lane when a store needs semantic search. Astropods blueprint
for deploy. Browser lane only where APIs don't exist.

## Status

Live: SDK seams, negotiation engine, seller caps, buyer proxy, PayPal
rail, Channel3 lane, demo app, 47 green tests. Live-money proof runs
the moment sandbox keys land — the code paths wait, nothing is stubbed
around them.

Next: sandbox money loop on video, pilot sellers, public launch.

## Integrate (10 minutes)

```ts
import { MockStoreAdapter, groqProvider } from "macham"
```

Full guide: `docs/INTEGRATION.md`. Rules: `docs/STANDARDS.md`.
Map: `docs/FEATURES.md`. Evidence: `docs/RESEARCH.md`.
