# Macham

Macham puts a buyer agent on any fixed-price store with one line: it reads the live catalog, answers shoppers in plain language, and proposes a cart that a person approves before PayPal charges.

> Buyer-only: no negotiation, no seller side, no purchase without a human click.

## Problem

- Store search matches words, not intent. "A warm coat for winter walks" returns nothing while the parka is in stock, and the shopper is gone inside a minute.
- Answering a product question needs a person, and replies land hours after the question, long after the sale was winnable.
- Chatbots bolted onto a storefront quote prices and stock they never read. Every invented number becomes a refund or a complaint.
- Owners will not let a bot spend a customer's money, so most fixed-price stores run no assistant at all.

## Solution: how it works

An assistant that lives on the store's own page and talks only about what the store actually sells.

- The store pastes one tag pointing at its gateway, `<script src="http://localhost:8787/macham.js">`; that gateway serves the bundle at `GET /macham.js`. Shoppers on stores that never integrate install the browser extension instead.
- A shopper asks in plain language. The assistant reads the store's real catalog server-side and narrates from those rows, never from memory.
- It then proposes add or remove actions. A person approves, PayPal Orders v2 creates, authorizes, and captures inside tolerance, and Rialo anchors the event.

The differentiator is the scope: Macham is buyer-only. Prices stay fixed, there is no seller console, and nothing is charged without a click from a human.

## See it working

Open [https://macham.vercel.app](https://macham.vercel.app). The hero walks through a full run — ask, match, add, approve — and the "Try it" panel runs the same agent live in your browser. From this repo, `node server/assist.mjs` serves the widget bundle at `GET /macham.js`, and `src/widget/assistant.ts` is what that snippet mounts on any product page.

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Money rail | PayPal Orders v2 | create, approve, capture, refund inside a tolerance — `src/rails/paypal.ts`, `POST /v1/orders` |
| Settlement audit | Rialo, `@rialo-ts-cdk` | one anchored memo per capture, fail-closed — `src/settlement/rialo.ts`, `server/audit.mjs` |
| Catalog, lane 1 | Shopify Storefront GraphQL, WooCommerce, JSON-LD | keyless public reads, auto-detected — `src/adapters/universal.ts` |
| Catalog, lane 2 | Kernel | cloud browser for client-hydrated JSON-LD — `src/browser/kernel.ts` |
| Catalog, lane 3 | Channel3 | cross-retailer and free-text lookup — `src/catalog/channel3.ts` |
| Own index | Elasticsearch | ranks the store's own catalog first for free text — `src/catalog/elastic.ts`, `elastic/` |
| Model brains | Groq, then DeepSeek | narration and cart proposals; keys stay server-side — `src/providers/router.ts` |
| Gateway | Node HTTP, TypeScript | key, scope, plan, rate, and meter checks; SSRF-guarded resolve — `server/assist.mjs` |
| Buyer surfaces | esbuild IIFE loader, Chrome MV3 | `src/loader.ts`, `src/extension-content.ts` |
| Landing | Vite static site | `site/index.html`, `site/src/main.ts` |

## Architecture

The page-side code holds only the store's own publishable `mch_` key, which identifies and meters that store; everything that can read broadly or spend stays on the gateway. A chat turn classifies intent locally, passes catalog rows through the safety harness with effects set to none or proposal, and takes its wording from `POST /v1/assist`. Orders run only on the gateway, and the audit anchor is best-effort, so a chain problem cannot block a capture.

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

Install from source; the package is not published to npm.

```bash
git clone https://github.com/0xdfinity/macham.git
cd macham
npm install
npm run build   # tsc -p tsconfig.build.json, writes dist/
npm test        # node --test ./test/*.mjs
```

### Run

```bash
cp .env.example .env                         # add your model key, then save
node server/keys.mjs mint --env live         # prints the store's mch_ key once
npm run build:loader                          # dist-loader/macham.js, served at GET /macham.js
node server/assist.mjs                        # listens on ASSIST_PORT, default 8787
curl http://localhost:8787/health             # { ok, plan, uptime_s }
```

Embed the widget once the loader is served:

```html
<script src="http://localhost:8787/macham.js" defer></script>
<script>
  Macham.init({ apiKey: "mch_live_bd8c89d26e9f77097b0c920227e90519ffabcfd008b8aeb1_70b07ae6", tenantId: "my-store", assistUrl: "http://localhost:8787" })
</script>
```

The `mch_` key is publishable: it meters this store and can only propose, never capture. Order routes fail closed — without `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` they answer 503 rather than charging, and without `RIALO_AUDIT_ENABLED=true` plus a funded key the anchor reports `anchored: false`. To try the widget on stores that never integrated, run `npm run build:ext` and load `extension/` unpacked in Chrome.

### Environment Variables

Copy `.env.example` to `.env`, which is git-ignored; the gateway reads it at start.

| Variable | What it does |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | primary model brain, server-side only; merchants never hold a model key |
| `DEEPSEEK_API_KEY` | second brain the router fails over to |
| `MACHAM_API_KEY` | the store's own publishable `mch_` key for the loader and SDK |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` | PayPal Orders v2 credentials and environment |
| `ASSIST_CORS` | browser origins allowed to call the gateway |
| `KERNEL_API_KEY`, `CHANNEL3_API_KEY` | optional paid catalog lanes; a lane skips when its key is absent |
| `ELASTIC_URL`, `ELASTIC_KEY` | opt-in semantic lane over the store's own index |

`ASSIST_PORT`, `KEYSTORE_PATH`, `ASSIST_DEFAULT_PLAN`, and `RATE_LIMIT_PER_MIN` have working defaults in `server/assist.mjs`.

## License

MIT. See [LICENSE](LICENSE).
