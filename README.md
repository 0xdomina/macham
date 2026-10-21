# Macham

Every store gets an assistant. Every shopper gets answers.

- Video: [video URL]
- Widget: one `<script>` tag on any storefront
- Website: [site URL]
- API: [public Postman workspace](https://www.postman.com/domina9193-4264801/macham)

## What it is

Macham is a commerce assistant that works with any store. A shopper asks for products in plain language. Macham searches live catalogs, compares offers, proposes the bag, and settles through PayPal after a human approves. Prices are fixed by the store — Macham orders them, it does not haggle. One key meters everything. Model keys never leave the server.

## Problem

Small stores lose shoppers they never get to talk to. Replies take hours. Shoppers leave in under a minute. Support teams paste tracking links all day. Existing chatbots invent prices and die at checkout. Macham answers in seconds, prices from live reads, and closes through PayPal.

## What it does

Shoppers search in plain language, compare live offers, get cart proposals, approve in chat, pay through PayPal, and talk by voice. Checkout locks the exact total from the live read, then the human approves, then PayPal authorizes and captures within tolerance, then the receipt lands. Refunds return to the verified payer.

## How it ships in

The buyer assistant is one **widget**: a small bottom-right bubble that opens a
floatable chat panel (never full-screen). Three routes mount that same widget:

| Route | Who | Effort |
|---|---|---|
| Snippet | Any storefront with HTML access | One `<script>` tag + one init call. |
| SDK | Custom UI and Node backends | `Macham.init({…})`, or your own adapter / `new UniversalAdapter(url)`. |
| Extension | Shoppers on stores that never integrate | Auto-mounts the widget on any store; configure key/tenant once. |

Shopify, WooCommerce, and JSON-LD storefronts need zero store-side code — the
adapter detects the lane. Exotic backends implement five methods once.

## Stack

| Layer | Choice |
|---|---|
| Assist gateway | Node server, zero new dependencies. Key verify, plan gate, usage metering. |
| Catalog | Universal adapter first, Channel3 enrichment second. Server keys only. |
| Money | PayPal Orders v2, sandbox-first. Tolerance-checked capture. |
| Audit | Rialo testnet. Every settlement event anchored with a Memo transaction. |
| Tables | AG Grid Community. Live ledger rows, approvals with Undo. |
| Contracts | Postman public workspace plus OpenAPI. Import into APIMatic for SDKs. |
| Voice | Browser speech APIs. No vendors. |
| Browser lane | Kernel REST (sessions, Playwright execute, delete). Read-only. Fallback only. |
| Semantic lane | Elastic BM25 now, hybrid when rows carry vectors. Activates per store. |
| Deploy | Astropods blueprint plus Render. Portable agent logic regardless. |

A request travels one path. Store reads normalize to products. The safety harness checks every capability against its contract. The provider router answers through Groq with failover. PayPal moves the money. Rialo remembers it.

## Proof

Live sandbox order created, approve host `www.sandbox.paypal.com`. Any-store resolve against a live store, zero keys, products with titles, merchant URLs, prices. Assist gateway answers with real narration and meters usage. Bad and revoked keys get `401`. Rialo devnet append signs and read-back matches. All dated 2026-10-03 in `docs/SUBMISSION.md`. 43/43 tests green. Fail-closed throughout.

## Run it

Merchant embed (one line, mounts the widget on their store):

```html
<script src="https://YOUR-MACHAM-HOST/macham.js"></script>
<script>Macham.init({ apiKey: "mch_live_…", tenantId: "your-store" })</script>
```

Gateway (serves the widget's brain, catalog reads, PayPal, and settlement):

```bash
npm install && npm run build && npm test # 48 green, offline
node server/keys.mjs mint --env live --orders  # secret prints once
node server/assist.mjs   # /v1/assist, /v1/catalog/resolve, /v1/orders, /v1/settlement/*
```

## License

MIT. See `LICENSE`.
