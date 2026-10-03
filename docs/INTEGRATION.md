# Integrate Macham (ABC)

Three steps. Ten minutes. No platform team needed.

## A. Paste one line

```html
<script src="https://cdn.macham.io/macham.js" data-key="mch_live_..." defer></script>
```

## B. Name your assistant

```ts
Macham.init({
  store: myStore,
  brain: myBrain,
  tenantId: "my-store",
  identity: { name: "Ada" },
})
```

A chat bubble appears bottom-right. Shoppers ask, approve carts, get
answers. Done.

## C. Describe your store (if custom)

```ts
import type { StoreAdapter } from "macham"

export const myStore: StoreAdapter = {
  storeId: "my-store",
  listProducts: ({ limit, query, categoryId }) => /* your API */,
  getProduct: (idOrHandle) => /* your API */,
  listCategories: () => /* your API */,
}
```

npm installs (`npm i macham`) work the same for bundler setups.

## Rules

- Keys live in env, never in code. The widget never sees them.
- Start with the mock store to learn the shape, swap in yours.
- Something unclear at any step is a docs bug. Report it.
