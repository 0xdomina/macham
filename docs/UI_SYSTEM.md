# Macham UI system

Mind-blowing yet instantly understood. Big-tech monochrome. Mobile first.

## Take, don't build (all MIT/compatible verified)

- **shadcn/ui**: ownership model — vendor `button, sheet, dialog, skeleton,
  sonner, command, tabs, avatar, badge, input, form` plus `cn()` + CSS vars.
- **assistant-ui**: chat foundation — `Thread, Message, Composer`,
  tool-call cards, approval cards, attachments. Never hand-roll chat.
- **channel3-ui**: marketplace blocks — product search, details, cards,
  offers, price history. Server fetchers stay ours.
- **AG Grid Community**: ledger tables (Quartz theme, CSS vars). Enterprise
  features (grouping, export, AI Toolkit) stay out unless a scored demo
  needs them.
- **Dashboard shell**: sidebar + command-K + filter-state-in-URL pattern
  (Nuqs-style). Strip auth/sentry equivalents we don't use.

## Theme (black, white, grey — one accent discipline)

```css
:root {
  --paper: #FFFFFF; --paper-2: #F5F5F5; --paper-3: #EBEBEB;
  --ink: #0A0A0A; --ink-2: #3A3A3A; --ink-3: #6B6B6B;
  --hairline: #E5E5E5; --hairline-strong: #D4D4D4;
  --accent: #0A0A0A;
  --danger: #B3261E; /* destructive money moves only */
  --radius: 12px;
}
.dark {
  --paper: #0A0A0A; --paper-2: #141414; --paper-3: #1F1F1F;
  --ink: #FAFAFA; --ink-2: #D4D4D4; --ink-3: #A3A3A3;
  --hairline: #262626; --hairline-strong: #404040;
  --accent: #FAFAFA;
}
```

Rules: 1px hairlines, never grey-on-grey boxes. Black buttons, white text
(inverted in dark). Status by icon + label, never hue alone. Ledger
amounts in mono tabular. Danger red reserved for irreversible money.

## Type

- Display: Space Grotesk 500/700 at 18px+. Tight tracking (-0.02em).
- Body/UI: Inter 400/500/600. Never Grotesk in tables.
- Money/hashes: JetBrains Mono, tabular-nums.
- Two weights per family max. Zero tracking on body text.

## Motion (budgeted)

- CSS only covers 80%: fades, shimmer skeletons, sheets
  (280ms in, 140ms out). Animate transform + opacity only.
- Lists: one stagger hook (AutoAnimate-class, <3kb), first 5–8 items.
- Numbers: 900ms easeOutCubic rAF tween, instant under reduced motion.
- Banned: parallax, confetti on payment, spinners without status text,
  layout animation on every mount.
- Tokens: `--m-quick:180ms; --m-standard:280ms; --m-deliberate:440ms`.

## Chat patterns

- Stream tokens instantly, auto-scroll only when pinned; jump-to-latest
  pill otherwise.
- Tool transparency cards: `Checking price.` `Comparing 3 offers.`
  `Waiting for approval.` Never raw JSON.
- Approval cards show amount + merchant + masked account. Model text
  never triggers payment; server re-reads params on confirm.
- Max 3 suggestion chips above the composer. Mic button in composer,
  44px target. Enter sends. Errors read `Send failed. Retry.`

## Mobile + ledgers

- 44px targets, primary actions in thumb reach, bottom sheets on mobile
  (center modals desktop only), safe-area insets, keyboard-safe inputs.
- Ledger rows 56px mobile / 40px desktop toggle. Amount right, mono.
  Filters as chips with Clear all. Four empty states, never one
  (`first use`, `filtered`, `error`, `released`).
- Every auto action gets Undo window + audit log (who, when, prior).
- Approve/Reject 44px; destructive needs second confirm; bulk approve
  states the total first.

## Timelines (Bryntum note)

Trial build only, removed before submission unless a scored demo needs
it — commercial license cannot ship. Replacement: FullCalendar or
vis-timeline on the same event/resource data shape.

## Copy seeds (use verbatim)

`Connect wallet to continue.` / `Payment pending. Check back soon.`
/ `Balance too low. Add funds.` / `No approvals needed.`
/ `₦50,000 refunded to wallet.` / `Session expired. Log in again.`
/ `No orders match these filters. Clear filters.`
/ `Mic blocked. Allow access in settings.`
/ `Price checked. 3 offers compared.`
