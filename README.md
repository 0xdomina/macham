# Macham

Agentic commerce for any store. Shoppers talk. Macham understands,
negotiates inside your rules, and settles through PayPal — with a
Merchant engine on the seller's end and a Buyer proxy on the shopper's.

## Partner stack (how judges see best use)

| Partner | Function in Macham |
|---|---|
| PayPal Orders v2 + Braintree | Settlement. Quote → create → approve → authorize → capture-within-tolerance → receipt + refund path. Sandbox-first. |
| PayPal Agent Toolkit / MCP | Agent-native order, refund, dispute, invoice calls beside the REST rail. |
| APIMatic | Publishes our contract as LLM context; we build with PayPal's plugin. No stale-doc hallucinations. |
| Channel3 | Catalog enrichment: search, lookup, variant re-resolution across retailers. Server key only, never the browser. |
| Elastic | Semantic inventory + negotiation-history search. Self-hosted Docker for builds. |
| AG Grid Community | Transaction ledger + approval queue tables. MIT, no Enterprise features. |
| Postman | Collections are the contract artifact: every rail call runnable, mocked, and tested. Fork link in repo. |
| Kernel | Fallback lane only: stealth browsing where no API exists. APIs first, always. |
| Astropods | Blueprint target for deploy and governance. Agent logic stays portable. |
| Skyvern pattern | `page.act` fallback semantics adapted, self-hosted. No fork, no copyleft in tree. |
| Voice | Browser mic → intent → spoken summary. Prototype loop in-repo. |
| Bryntum | Trial builds only. Ships replaced by open-source timeline before submission. |

## Layout

- `src/types.ts` — shared commerce shapes. Assistants speak Macham only.
- `src/adapters/` — the `StoreAdapter` seam plus a runnable mock store.
- `src/providers/` — the `AIProvider` seam, router with failover, mock double.
- `src/safety/` — harness: registry, contracts, PII scrub, proposal-only effects.
- `src/tenancy/` — explicit tenant scope, namespaced stores.
- `src/negotiation/` — tiers, RFQ lifecycle, guardrails.
- `src/seller/` — listing, pricing, insights, accounting, marketing, brief.
- `src/buyer/` — intent, search/compare, cart proposals, threaded chat.
- `src/assistant/` — identity: name, mascot tiers, tone.
- `src/rails/` — settlement rails (PayPal live, others stubbed).
- `src/catalog/` — enrichment lanes (Channel3 live, others stubbed).
- `demo/` — runnable storefront: chat, ledger, approvals, voice.
- `postman/` — contract collection with mocks.
- `docs/` — architecture, standards, feature map, research, keys, mascot, landing, integration.

## Use

```ts
import { MockStoreAdapter, groqProvider } from "macham"

const store = new MockStoreAdapter()
const brain = groqProvider(process.env.GROQ_API_KEY!)
const products = await store.listProducts({ query: "tee" })
```

```bash
npm install
npm test
```

## Rules

`docs/STANDARDS.md` is load-bearing. Tests green before every commit.
Fail-closed money. Secrets in env only. Copy standard on all strings.
