# Macham

Macham puts a buyer agent on any fixed-price store with one line: it reads the live catalog, answers shoppers in plain language, and proposes a cart that a person approves before PayPal charges.

> Buyer-only: no negotiation, no seller side, no purchase without a human click.

## Problem

- Store search matches words, not intent. "A warm coat for winter walks" returns nothing while the parka is in stock, and the shopper is gone inside a minute.
- Answering a product question needs a person, and replies land hours after the question, long after the sale was winnable.
- Chatbots bolted onto a storefront quote prices and stock they never read. Every invented number becomes a refund or a complaint.
- Owners will not let a bot spend a customer's money, so most fixed-price stores run no assistant at all.

## Solution

An assistant that lives on the store's own page and only talks about what the store actually sells.

- The store pastes one tag, `<script src="https://YOUR-MACHAM-HOST/macham.js">`, where that host is wherever the gateway runs and serves `GET /macham.js`. Shoppers on stores that never integrate install the browser extension instead.
- A shopper asks in plain language. The assistant reads the store's real catalog server-side and narrates from those rows, never from memory.
- It then proposes add or remove actions. A person approves, PayPal Orders v2 creates, authorizes, and captures inside tolerance, and Rialo anchors the event.

The differentiator is the scope: Macham is buyer-only. Prices stay fixed, there is no seller console, and nothing is charged without a click from a human.

## Demo

This repository ships no hosted URL and no screenshots, so run the two commands and see the product in the browser.

1. `node server/assist.mjs`, then open `http://localhost:8787/health` — it answers with the active plan and uptime.
2. `npm run build:loader`, then request `http://localhost:8787/macham.js` — that bundle is the single line a storefront pastes.
3. Paste it into any product page and the bubble opens the chat panel, draws product cards with images and prices, and shows the approve buttons: `src/widget/assistant.ts`.
4. The marketing page lives in `site/index.html`; its hero renders the same panel and approval card.

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Money rail | PayPal Orders v2 | `src/rails/paypal.ts`, routed by `POST /v1/orders` in `server/assist.mjs`: create, approve, authorize, capture, refund. Sandbox until live credentials are set. |
| Settlement audit | Rialo testnet or devnet, `@rialo/ts-cdk` | `src/settlement/rialo.ts`, `server/audit.mjs` behind `POST /v1/settlement/anchor` and `GET /v1/settlement/audit/`: one memo transaction per capture, fail-closed. |
| Catalog lane 1 | Shopify tokenless Storefront GraphQL, WooCommerce Store API, JSON-LD sitemaps | `src/adapters/universal.ts`: keyless public reads, platform auto-detected, read-only. |
| Catalog lane 2 | Kernel, `api.onkernel.com` | `src/browser/kernel.ts`: cloud browser that reads client-hydrated JSON-LD. Extract only; clicks, fills, and logins refuse. |
| Catalog lane 3 | Channel3, `api.trychannel3.com` | `src/catalog/channel3.ts`: cross-retailer lookup and free-text search behind the server key. |
| Own index | Elasticsearch | `src/catalog/elastic.ts` and `elastic/`: ranks the store's own catalog first for free-text; BM25, kNN when rows carry embeddings. |
| Model brains | Groq, then DeepSeek | `src/providers/router.ts` behind `POST /v1/assist`: narration and cart proposals. Keys stay on the server. |
| Gateway | Node HTTP server, TypeScript, ES2020 modules | `server/assist.mjs`: key verify, scope and plan gates, rate limit, metering, SSRF-guarded catalog resolve, `/macham.js` asset route. |
| Buyer surfaces | esbuild IIFE loader, Chrome MV3 extension | `src/loader.ts` to `dist-loader/macham.js`, `src/extension-content.ts` to `extension/content.js`. |
| Landing | Vite static site | `site/index.html`, `site/src/main.ts`. |

## Architecture

The page-side code holds only the store's own publishable `mch_` key, which identifies and meters that store. Everything that can read broadly or spend stays on the gateway. Chat turns classify intent locally, pass catalog rows through the safety harness with effects set to none or proposal, and get their wording from `POST /v1/assist`. Orders run only on the gateway, and the audit anchor is best-effort, so a chain problem cannot block a capture.

```text
store page   widget + reader       holds mch_ key only
                |
    POST /v1/assist                 POST /v1/catalog/resolve
                v                                   v
 gateway   verify key > scope > plan limit > rate limit > meter usage
    |                |                 |
    v                v                 v
 Groq / DeepSeek   PayPal v2       Universal > Kernel > Channel3
    |                |              (Elastic first for free text)
    v                v
 proposal > human approval > capture in tolerance > Rialo anchor
```

## Key Features

- **One line, any storefront.** A script tag plus `Macham.init()` mounts the bubble; no rebuild and no backend change (`src/loader.ts`).
- **Prices from a live read.** The ladder tries the store's own public endpoints before any paid lane, and each lane fails closed into the next (`server/assist.mjs`).
- **Proposals, not actions.** Add and remove arrive as buttons and change nothing until one is clicked (`src/widget/assistant.ts`).
- **Approval before money.** Authorize, then capture at most 115% or 7500 minor units over, whichever is smaller, or the capture is refused (`src/rails/paypal.ts`).
- **Settlement proof you can read back.** Each capture anchors a Rialo event, retrievable by order reference (`GET /v1/settlement/audit/`).
- **Shop stores that never integrated.** The extension mounts the same widget in an isolated world, so the page cannot read the key (`extension/manifest.json`).

## Quick Start

### Prerequisites

- Node.js 22 or newer with npm 10+ for the build, the test runner, and the gateway.
- A Groq or DeepSeek API key; the gateway exits with a clear line when neither is set.
- Chrome 120+ only if you load the extension.

### Setup

From an existing checkout; the package is not published to npm.

```bash
npm install
npm run build   # tsc -p tsconfig.build.json, writes dist/
npm test        # node --test ./test/*.mjs
```

### Run

```bash
cp .env.example .env                       # then set GROQ_API_KEY or DEEPSEEK_API_KEY
node server/keys.mjs mint --env test --orders   # the mch_ secret prints once
node server/assist.mjs                     # listens on ASSIST_PORT, default 8787
curl http://localhost:8787/health
npm run build:loader                       # dist-loader/macham.js, served at GET /macham.js
npm run build:ext                          # extension/content.js, load extension/ unpacked
```

Embed it in a storefront once the loader is built:

```html
<script src="https://YOUR-MACHAM-HOST/macham.js" data-key="mch_live_..." defer></script>
<script>
  Macham.init({ apiKey: "mch_live_...", tenantId: "my-store", assistUrl: "https://YOUR-MACHAM-HOST" })
</script>
```

PayPal and Rialo sit in sandbox and testnet until you set live credentials. Without `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` the order routes answer 503 rather than pretending to charge, and without `RIALO_AUDIT_ENABLED=true` plus a funded key the anchor reports `anchored: false`.

### Environment Variables

Copy `.env.example` to `.env`, which is git-ignored. The gateway reads the file at start. Values are yours to fill in.

| Variable | What it does | Value |
|---|---|---|
| `GROQ_API_KEY` | Primary model brain, server-side only. | |
| `GROQ_MODEL` | Model id served by Groq. | |
| `DEEPSEEK_API_KEY` | Second brain; the router fails over to it. | |
| `MACHAM_API_KEY` | The store's own `mch_` key for the loader and SDK. | |
| `PAYPAL_CLIENT_ID` | PayPal Orders v2 credential. | |
| `PAYPAL_CLIENT_SECRET` | PayPal Orders v2 credential. | |
| `PAYPAL_ENV` | `sandbox` or `live`. | |
| `ASSIST_CORS` | Comma-separated origins allowed to call the gateway from a browser. | |
| `KERNEL_API_KEY` | Enables the Kernel browser lane; lane skips when unset. | |
| `CHANNEL3_API_KEY` | Enables the Channel3 lane and free-text search. | |
| `ELASTIC_URL` | Endpoint of the store's own index. | |
| `ELASTIC_KEY` | With the URL above, enables the Elastic lane. | |

`ASSIST_PORT`, `KEYSTORE_PATH`, `ASSIST_DEFAULT_PLAN`, and `RATE_LIMIT_PER_MIN` have working defaults set in `server/assist.mjs`.

## License

MIT. See [LICENSE](LICENSE).
