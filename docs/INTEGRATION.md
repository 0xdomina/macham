# Integrate Macham (every path, honestly graded)

## Path 1 — Snippet (10 minutes, frontend only)

For: any storefront with HTML access. No backend changes. No rebuild.

```html
<script src="https://YOUR-MACHAM-HOST/macham.js" data-key="mch_live_..." defer></script>
<script>
  Macham.init({
    apiKey: "mch_live_...",
    tenantId: "my-store",
    assistUrl: "https://YOUR-MACHAM-HOST",
    identity: { name: "Ada" },
  })
</script>
```

You get: bubble, chat, search, proposals, approvals. The store reads
itself (Shopify, Woo, JSON-LD auto-detect). Pass `store:` only for
custom backends. Intelligence runs on Macham cloud, metered per key.

You need: one `<script>` paste plus your Macham API key. No model keys.

## Path 2 — npm SDK (an afternoon, full control)

For: custom UI, server-side readers, Node backends.

```bash
# From the Macham checkout (the package is not published to npm):
npm install
npm run build
```

```ts
// Deep import: the browser bundle takes the universal lane only.
// Server modules (keys, keystores, rails) never ship to the store.
import { UniversalAdapter } from "macham/dist/adapters/universal.js"

Macham.init({
  store: new UniversalAdapter("https://my-store.com"),
  apiKey: process.env.MACHAM_API_KEY!,
  tenantId: "my-store",
})
```

Zero code for Shopify, WooCommerce, and JSON-LD storefronts — the adapter
detects the lane. Hand-written adapters remain for exotic backends only
(Medusa, ERPs, spreadsheets): implement `StoreAdapter` (3 methods: list,
get, search) and everything follows.

You need: API access to your own catalog, your Macham API key, one
engineer for an afternoon. Model keys stay on our server.

## Path 3 — Backend rails (a week, money moves)

For: checkout, refunds, ledger persistence, webhooks.

Lock the exact total from the live read → approve → capture through PayPal
Orders v2, tolerance-checked.
Channel3 enrichment behind your server key. Postgres tenant store,
key rotation, rate limits per `docs/FEATURES.md` hardening sprint.

You need: PayPal business account, sandbox test run on video, a small
backend surface (3 endpoints), ops contact for the money.

Reference gateway (ships in `server/`, zero new dependencies):

```bash
node server/keys.mjs mint --env test   # secret prints once, store keeps hashes
node server/assist.mjs                 # POST /v1/assist, GET /health
```

Exact env: `GROQ_API_KEY`, `GROQ_MODEL`, `ASSIST_PORT` (8787),
`KEYSTORE_PATH` (`./data/keystore.json`, git-ignored), `ASSIST_CORS`,
`ASSIST_DEFAULT_PLAN` (free), `RATE_LIMIT_PER_MIN` (60). Sandbox proof
runs against `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` with
`PAYPAL_ENV=sandbox`.

## Path 4 — Platform apps (later, zero paste)

Shopify app, WooCommerce plugin, Medusa plugin. OAuth install,
webhooks keep catalog in sync, app proxy serves the bubble. This
removes even the snippet. Not built yet — tracked in FEATURES.

## What every path needs from you

1. **Catalog access.** Read API or feed. No catalog, no assistant.
2. **One Macham API key.** `mch_live_...` from the dashboard. It meters
   sessions and model calls against your plan. No model keys, ever.
3. **A tenant id.** Your platform key binds it. Users inherit it.
4. **For money:** PayPal business + sandbox proof run.

## Engineering hurdles, plainly stated

| Hurdle | Reality |
|---|---|
| CORS | Your API must allow our origin, or proxy through your server |
| CSP | `script-src` must allow the CDN host; nonces documented |
| Checkout | Only Path 3 moves money; paths 1–2 propose, humans approve |
| Catalog sync | Webhooks or hourly pull; stale catalogs lie to shoppers |
| Auth | Integrated stores connect with your own `mch_` API key; we never hold your passwords |
| WebViews | In-app browsers need safe-area + keyboard testing, not new code |
| Performance | 30KB loader; catalog pages stay yours, we add one bubble |
| Privacy | PII scrubbed before models; tenant data never crosses tenants |

## Rules

- Keys live in env, never in code. The widget sends only your `mch_`
  key. Model keys live on our server and never ship to browsers.
- Start with the mock store to learn the shape, swap in yours.
- Something unclear at any step is a docs bug. Report it.
