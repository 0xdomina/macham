# Macham AI features (from How's U inventory, reimplemented clean)

Ideas only — no platform code lives here. Each feature below is rebuilt
against seams (`StoreAdapter` readers, `AIProvider` router), never ported.

## Provider router (mirror the good parts)

Registry `{id, label, modelId, resolve()}`, enabled-list + extras JSON,
per-thread cursor + last-success, `failedProviders` telemetry, hidden
provider identity, 30s timeout / 600-token caps, mock double for offline
tests, usage-callback hook (hosts own the ledger, never the SDK).

## Seller engine (in build order)

1. **Listing writer** — rough notes to title, description, tags, SEO.
   Zod-structured output. Zero platform coupling.
2. **Pricing advisor** — suggested/floor/ceiling from caller-supplied
   aggregates (min/median/max). Never competitor rows.
3. **Insights Q&A** — NL over injected store JSON. Grounding rule:
   data-only, say so when unanswerable.
4. **Accounting digest** — narrative over caller-computed aggregates.
   Deterministic totals, model narrates.
5. **Marketing coach** — promos and bundles from injected catalog.
6. **Daily brief** — narrator over a numbers schema; scheduler and
   storage stay host-side.
7. **Recommendations** — deterministic ranker (pure code, no model)
   plus thin explainer per opportunity.

## Buyer proxy (in build order)

1. **Intent classifier** — regex routing (cart_add/remove,
   price_compare, review_summary, product_search, general). No model
   call. Safe fallback.
2. **Grounded search + compare** — catalog-reader results plus
   comparative narration. One capability, two narration modes.
3. **Cart proposal** — approvable add/remove actions with variant, qty,
   title, price. AI proposes, never mutates.
4. **Threaded chat** — history replay, guest or signed-in actor,
   conversation store injected by host.
5. **Review summaries** — LATER. Needs a reviews adapter most stores lack.

## Safety harness (the core)

Capability registry + reader allowlist + Zod contracts + text filter
(PII, capability tags) + side-effect policy (none or proposal-only).
Every capability passes one chokepoint. Port this before any assistant.

## Explicitly not ported

Quota ledgers, RBAC gates, conversation persistence, dead placeholders
(seller_chat), platform-coupled analytics shapes. Hosts own storage,
auth, and billing — the SDK defines those interfaces and nothing more.

## Free-tier doctrine

Every provider and lane ships with a free path (mock doubles, trial
keys, self-host fallbacks) and a named swap point. After the hackathon
each swaps independently: models, search backend, timeline lib, host.
Nothing structural depends on a trial.
