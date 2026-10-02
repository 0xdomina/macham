# Integrate Macham (ABC)

Three steps. Ten minutes. No platform team needed.

## A. Install

```bash
npm i macham
```

## B. Describe your store

Implement three methods. Copy this shape, fill your platform's calls:

```ts
import type { StoreAdapter } from "macham"

export const myStore: StoreAdapter = {
  storeId: "my-store",
  listProducts: ({ limit, query, categoryId }) => /* your API */,
  getProduct: (idOrHandle) => /* your API */,
  listCategories: () => /* your API */,
}
```

## C. Show the assistant

```tsx
import { Assistant } from "macham/widget"
import { groqProvider } from "macham"
import { myStore } from "./my-store"

<Assistant
  store={myStore}
  brain={groqProvider(process.env.GROQ_API_KEY!)}
  mascot="beam"
/>
```

A chat bubble appears bottom-right. Shoppers ask, approve carts, get
answers. Done.

## Rules

- Keys live in env, never in code. The widget never sees them.
- Start with the mock store to learn the shape, swap in yours.
- Something unclear at any step is a docs bug. Report it.
