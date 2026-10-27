// The film's catalogue rows — every field copied from data already committed in
// this repo, so nothing on screen is invented.
//
// Provenance (all three come from test/universal.test.mjs, the upstream adapter
// contract tests, i.e. the shapes the real UniversalAdapter produces per lane):
//
//   Harbor Parka   Shopify lane   test/universal.test.mjs:22,43
//                          price { amountMinor: 4200, currency: "USD" },
//                          description "Warm.", handle "harbor-parka"
//   WordPress Pennant  WooCommerce lane  test/universal.test.mjs:53-58,74
//                          price { amountMinor: 2500, currency: "USD" },
//                          short_description "Flag.", slug "pennant"
//   Trail Shell    JSON-LD lane   test/universal.test.mjs:81,99
//                          offers price "46.50" USD -> { amountMinor: 4650 },
//                          description "Light shell.",
//                          metadata.url https://plain.example/products/trail-shell
//
// imageUrl is deliberately null on every row. The repo's only product image URLs
// are placeholder strings (`https://x/img.jpg`) that cannot load in an offline
// render; the widget's genuine no-image state is the `.thumb.ph` initial tile
// (src/widget/assistant.ts:171-175). The film shows that real state rather than
// inventing product photography. See NOTES.md.

export const FILM_PRODUCTS = [
  {
    id: "gid://product/harbor-parka",
    title: "Harbor Parka",
    handle: "harbor-parka",
    description: "Warm.",
    imageUrl: null,
    price: { amountMinor: 4200, currency: "USD" },
    metadata: { source: "shopify", url: "https://probe.example/products/harbor-parka" },
  },
  {
    id: "woo:34",
    title: "WordPress Pennant",
    handle: "pennant",
    description: "Flag.",
    imageUrl: null,
    price: { amountMinor: 2500, currency: "USD" },
    metadata: { source: "woo" },
  },
  {
    id: "https://plain.example/products/trail-shell",
    title: "Trail Shell",
    handle: "trail-shell",
    description: "Light shell.",
    imageUrl: null,
    price: { amountMinor: 4650, currency: "USD" },
    metadata: { source: "jsonld", url: "https://plain.example/products/trail-shell" },
  },
];
