# Macham

Agentic commerce for any store. Shoppers talk. Macham understands,
negotiates inside your rules, and settles through PayPal — with a
Merchant engine on the seller's end and a Buyer proxy on the shopper's.

## Position

Most stores run **fixed prices**. Macham does not haggle over them. It
negotiates only where negotiation is real: bulk tiers, clearance, shipping
and terms — inside merchant guardrails, with every concession logged.
See `docs/FEATURES.md` for the scope verdict and `docs/RESEARCH.md` for
the evidence behind it.

## Layout

- `src/types.ts` — shared commerce shapes. Assistants speak Macham only.
- `src/adapters/` — the `StoreAdapter` seam plus a runnable mock store.
- `src/providers/` — the `AIProvider` seam plus an OpenAI-compatible client
  (Groq, DeepSeek constructors included).
- `docs/` — architecture, standards, feature map, research index.
- `test/` — seam contract tests. Green before every commit.

## Use

```ts
import { MockStoreAdapter, groqProvider } from "macham"

const store = new MockStoreAdapter()
const brain = groqProvider(process.env.GROQ_API_KEY!)
const products = await store.listProducts({ query: "tee" })
const answer = await brain.chat([
  { role: "user", content: `Describe ${products[0].title}` },
])
```

```bash
npm install
npm test
```

## Rules

`docs/STANDARDS.md` is load-bearing: TypeScript strict, tests green,
fail-closed money paths, secrets never in code, copy standard on every
user-facing string. Features land feature by feature; nothing ships
without its map entry in `docs/FEATURES.md`.
