# Integrate Macham (every path, honestly graded)

## Path 1 — Snippet (10 minutes, frontend only)

For: any storefront with HTML access. No backend changes. No rebuild.

```html
<script src="https://cdn.macham.io/macham.js" data-key="mch_live_..." defer></script>
<script>
  Macham.init({
    store: myStore,
    brain: myBrain,
    tenantId: "my-store",
    identity: { name: "Ada" },
  })
</script>
```

You get: bubble, chat, search, proposals, approvals. Catalog reads run
through your adapter (below) or ours.

You need: one `<script>` paste, a platform key, an AI provider key.

## Path 2 — npm SDK (an afternoon, full control)

For: custom UI, server-side readers, Node backends.

```bash
npm i macham
```

```ts
import { MockStoreAdapter, groqProvider } from "macham"
```

Implement `StoreAdapter` (3 methods: list, get, search) against your
platform API. Everything — chat, guardrails, proposals, ledger —
follows. Same for Medusa, Shopify, WooCommerce, or a spreadsheet.

You need: API access to your own catalog, a provider key, one engineer
for an afternoon.

## Path 3 — Backend rails (a week, money moves)

For: checkout, refunds, ledger persistence, webhooks.

Quote → approve → capture through PayPal Orders v2, tolerance-checked.
Channel3 enrichment behind your server key. Postgres tenant store,
key rotation, rate limits per `docs/FEATURES.md` hardening sprint.

You need: PayPal business account, sandbox test run on video, a small
backend surface (3 endpoints), ops contact for the money.

## Path 4 — Platform apps (later, zero paste)

Shopify app, WooCommerce plugin, Medusa plugin. OAuth install,
webhooks keep catalog in sync, app proxy serves the bubble. This
removes even the snippet. Not built yet — tracked in FEATURES.

## What every path needs from you

1. **Catalog access.** Read API or feed. No catalog, no assistant.
2. **One AI provider key.** Groq free tier starts; DeepSeek next.
3. **A tenant id.** Your platform key binds it. Users inherit it.
4. **For money:** PayPal business + sandbox proof run.

## Engineering hurdles, plainly stated

| Hurdle | Reality |
|---|---|
| CORS | Your API must allow our origin, or proxy through your server |
| CSP | `script-src` must allow the CDN host; nonces documented |
| Checkout | Only Path 3 moves money; paths 1–2 propose, humans approve |
| Catalog sync | Webhooks or hourly pull; stale catalogs lie to shoppers |
| Auth | Seller tools need your session; we never hold your passwords |
| WebViews | In-app browsers need safe-area + keyboard testing, not new code |
| Performance | 30KB loader; catalog pages stay yours, we add one bubble |
| Privacy | PII scrubbed before models; tenant data never crosses tenants |

## Rules

- Keys live in env, never in code. The widget never sees them.
- Start with the mock store to learn the shape, swap in yours.
- Something unclear at any step is a docs bug. Report it.
