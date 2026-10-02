# Research index

Every architectural claim traces to evidence below. TBD items are honest
gaps — verify before building on them.

## Pricing reality (verified 2026-10-02, subagent deep-pass)

- Fixed-price dominance (Shopify variant price + price lists + discount
  nodes; Salesforce price books + promotions; Jumia/Konga/Temu seller-set
  list + platform discount surface): Shopify price-rule/discount-node
  docs, Salesforce pricing/promotion docs, Jumia flash-sales pages.
- Real negotiation arenas: Alibaba MOQ tiers + RFQ flow; Amazon Business
  quantity discounts + gated RFQ over threshold; eBay Best Offer
  (auto-accept/decline bounds, 5-offer cap, 24h); Jiji chat bargaining
  (no escrow, no capture); Salesforce CPQ approvals; MAP policies
  (brand unilateral, bundling = violation).
- PayPal variable totals: Orders v2 authorize (29-day validity, 3-day
  honor) + capture within 115%/+$75 tolerance; partial captures;
  re-authorize on expiry.
- Verdict: negotiate bulk/clearance/shipping only; promotion selection
  (not haggling) for fixed-price B2C.

## Rialo L1 (verified 2026-10-02, subagent deep-pass)

- DevNet public via Playground (Google sign-in, faucet, 4 demo apps);
  testnet forming; **mainnet not launched**; `mainnet.rialo.io` constant
  is not a usable endpoint.
- Buildable today: append-only audit trail + budget-guard program
  (cap + allowlist + timer refund) via `@rialo/ts-cdk`, RISC-V/PolkaVM
  or SVM-style programs. No native HTLC primitive; escrow = program
  balance + timers + webcalls with a named attestor.
- Cannot prove parcel delivery or quality on any chain. Never claim it.
- EVM does not deploy on Rialo today (outbound REX only). TS interaction
  via CDK, not ethers/viem.
- Sources: rialo.io/for-devs, docs.rialo.io, learn.rialo.io tutorials,
  docs.rs rialo crates, npm @rialo/* packages, SubzeroLabs/rialo-examples.

## PayPal hackathon (verified 2026-10-02, web search)

- "Build What's Next": $60,000+, submissions Oct 1 → Nov 12 2026.
  Partners include Postman, Zapier, Elastic, APIMatic, AG Grid, Bryntum,
  Channel3, Render, Kernel (+ Astropods per program notes).
- Agentic direction: ACP/UCP protocols, MCP servers, Agent Toolkit,
  Braintree vaulting. Sandbox-first; live money never required to win.
- Past pattern (Dev Days 2025): working money movement + current SDKs +
  live demo beats slideware.

## Partner stack (status: direction from program brief + prior passes)

- Channel3 API/UI repos, AG Grid Community MIT, APIMatic context
  plugins, Postman free mocks/collections, Kernel/Browserbase-class
  stealth browsers, self-hosted Elastic, Astropods blueprints, Skyvern
  AGPL pattern, Gradbot→LiveKit voice path.
- TBD (verify before spending): exact sponsor-bonus thresholds per
  partner, AG Grid Enterprise AI Toolkit packaging, Bryntum license
  cost confirmation, Kernel/Flexible-stealth pricing, APIMatic portal
  mechanics, Astropods free-tier limits, InstaCloud-vs-Render free-tier
  terms for the demo host. Awaiting the partner deep-pass report; fold
  findings here on arrival.
