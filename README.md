# Macham

Store-agnostic AI SDK for e-commerce. Any store in, assistance out.

## Idea

Every store speaks its own dialect (Medusa, Shopify, WooCommerce, custom).
Assistants should not. Macham defines two seams:

- `StoreAdapter` — translate one platform into Macham shapes (products,
  categories, and later carts, orders, customers).
- `AIProvider` — one client for every OpenAI-compatible chat API, with
  named constructors for Groq and DeepSeek.

Features attach to the seams, never to a store. A buyer assistant written
once runs against any adapter.

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

## Status

Seams plus mock store plus providers. Assistants land feature by feature.
No How's U code lives here; ideas may be reimplemented, never copied.
