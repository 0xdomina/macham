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
  testnet live (see 2026-10-03 update below); **mainnet not launched**; `mainnet.rialo.io` constant
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

### Rialo testnet update (verified 2026-10-03, web pass)

- Verdict: testnet is live. Mainnet is not launched. The claim
  "testnet is live" checks out for testnet, not mainnet.
- Access steps today: sign in at playground.rialo.io (Google), open the
  Account tab, click "Request devnet $RIALO". One login covers the app
  catalog (Meridian, Guarded Vault, Ermac, Project 1337). Faucet tokens
  have no value and cannot move to exchanges.
- Programmatic path: `requestAirdrop` works on devnet and testnet only.
  Testnet RPC is `https://testnet.rialo.io:4101` (`URL_TESTNET`,
  `RIALO_TESTNET_CHAIN`, `getDefaultRialoClientConfig("testnet")` in
  `@rialo/ts-cdk` 0.18.1). Devnet is `https://devnet.rialo.io:4101`.
  The mainnet constant is not a usable endpoint.
- Explorer: testnet.rialoscan.org reads testnet.rialo.io directly (node
  0.20.0-alpha.0 at check time). No indexer. rialoscan.org states
  mainnet is not live.
- Provably live surface (CDK documented): transfers
  (`transferInstruction` plus `sendTransaction`), program deployment
  (`ProgramDeployment`: LoaderV4 default, RiscV, RexWasmV1), history
  reads (`getSignaturesForAddress`, `getTransaction`), fee and rent
  estimates, TEE secret sharing key fetch. Macham audit anchoring in
  `src/settlement/rialo.ts` uses transfers plus memo memos only.
- Documented but not yet proven inside Macham: timer driven
  subscriptions (`getSubscription`, `getTriggeredTransactions`, REX
  registry) and native webcalls with `AFTER wait until` resume. Verify
  on testnet before claiming budget-guard behavior.
- Roadmap only: mainnet (target 2026 per press), any token or airdrop
  (no ticker or tokenomics announced, points program only), EVM deploy
  (outbound REX only today), delivery or quality proofs (never claim).
- Sources: npm @rialo/ts-cdk 0.18.1 readme, testnet.rialoscan.org,
  rialoscan.org, learn.rialo.io async tutorial, agents.rialo.io,
  docs.rs rialo-cdk 0.11.2, KuCoin and HTX testnet notes May 2026,
  Bitrue guide Sep 2026, airdrops.io review Sep 2026.

## PayPal hackathon (verified 2026-10-02, web search)

- "Build What's Next": $60,000+, submissions Oct 1 → Nov 12 2026.
  Partners include Postman, Zapier, Elastic, APIMatic, AG Grid, Bryntum,
  Channel3, Render, Kernel (+ Astropods per program notes).
- Agentic direction: ACP/UCP protocols, MCP servers, Agent Toolkit,
  Braintree vaulting. Sandbox-first; live money never required to win.
- Past pattern (Dev Days 2025): working money movement + current SDKs +
  live demo beats slideware.

## Partner stack (deep-pass 2026-10-02, verified docs/repos)

- **Channel3**: API `api.trychannel3.com` (`x-api-key`, server-only),
  1000 free calls/mo, affiliate cut; `shopping-assistant` (archived
  demo — fork the tool-loop pattern, not the app); `channel3-ui` MIT
  shadcn registry (use directly, presentational only).
- **AG Grid**: Community MIT incl. production (Quartz theme, sorting,
  filter, pagination). Enterprise ($999/dev) only for AI Toolkit and
  server-side features. Never ship the watermark.
- **APIMatic**: context plugin/MCP feeds versioned API docs to coding
  agents (63% faster integration claimed). Generate ours, consume
  PayPal's. Do not build docs-RAG.
- **Postman**: free mocks/collections/flows; public workspace + fork
  link is cheap judging evidence. Past winner cited for it.
- **Kernel**: headless $0.06/hr, stealth + CAPTCHA solver, $5 free
  credit. Fallback lane only, never first resort.
- **Elastic**: self-host Docker for the build (free); hosted only for
  a production story. Trial data deletes after 30d.
- **Astropods**: blueprint registry + deploy/governance; keep agent
  logic portable regardless.
- **Skyvern**: AGPL upstream, but the author granted direct permission
  to reuse any part (attribute + pin the commit on use). `page.act`
  fallback lane stays API-last regardless.
- **Voice**: prototype Gradbot (50-line loop, trial credits), ship
  LiveKit (free 1000 agent-min/mo).
- TBD (verify before spending): exact sponsor-bonus thresholds per
  partner, Astropods free-tier limits, InstaCloud-vs-Render terms for
  the demo host.

## UI/UX system (deep-pass 2026-10-02)

- Steal list (all MIT/compatible): shadcn/ui primitives, assistant-ui
  chat (Thread/Message/Composer, approval cards), channel3-ui blocks,
  AG Grid Community, dashboard shells (MIT starters only — never the
  Vercel chatbot verbatim, license unclear).
- Type: Space Grotesk display + Inter body + JetBrains Mono money.
  Two weights per family max.
- Monochrome tokens in `UI_SYSTEM.md`; danger red for irreversible
  money only; status by icon + label, never hue alone.
- Motion budget: CSS-first (80%), one stagger hook, 900ms number
  tweens, reduced-motion respected. No parallax, no confetti.
- Chat: instant streaming, tool transparency cards, approval cards
  with amount + masked account, max 3 suggestion chips, 44px mic.
- Dashboards: 56px mobile rows, chip filters with Clear all, four
  distinct empty states, Undo window + audit on every auto action.
- Mobile: 44px targets, thumb-reach primaries, bottom sheets, safe
  areas, WebView null-origin + keyboard overlap handling.
- Copy seeds in `UI_SYSTEM.md` follow the platform standard.

## How's U AI inventory (verified in-repo 2026-10-02)

Seams to mirror: provider registry + failover + mock double,
per-thread cursor/last-success, hidden provider identity, usage hook.
Bring: safety harness, listing writer, pricing advisor, insights Q&A,
accounting digest, marketing coach, brief + deterministic ranker,
buyer chat + intent classifier + search/compare + cart proposal
(proposal-never-mutation). Later: review summaries. Skip: quota
ledgers, RBAC, persistence, dead placeholders. Full table in
`AI_FEATURES.md`.
