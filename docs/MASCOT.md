# Macham mascot system

Headless by default. Mascot is per-tenant clothing, never the brain.

## Why this shape

Dev tools stay faceless (Copilot, Notion AI). Support bots wear faces
(Fin, Ada). Commerce needs both: invisible at money screens, present
for discovery. So the SDK ships headless and each store opts into a
face with one prop.

## Three tiers

1. **None.** Brand dot only. Default at checkout, payments, errors,
   refunds. Never animate here.
2. **Procedural.** Seeded avatar from the tenant id. Tenant picks style
   family + palette + round/square. Zero uploads.
   Libraries: boring-avatars (MIT, default) plus DiceBear core with
   CC0-safe styles only (bottts, pixel-art, lorelei — check each
   style's license before bundling).
3. **Custom.** Upload PNG/SVG + name + tone preset. Falls back to
   tier 2 when missing.

## Tone mapping

- **Precise:** formal, short, cites totals. Geometric avatar. Used
  for returns, shipping, payments.
- **Friendly:** warm, one emoji max. Rounded avatar. Used for
  discovery and sizing.
- **Playful:** tenant opt-in only, never on errors. Illustrated
  avatar. Used for empty cart and delight moments.

Config shape:

```ts
assistant: {
  name: "Shop helper",
  avatar: { mode: "procedural" | "upload" | "none" },
  tone: "precise" | "friendly" | "playful",
}
```

Always label it "AI assistant" under the bubble.

## Bubble spec

- Launcher 56–64px bottom-right, badge count, keyboard focusable.
- Panel 380–420px, full sheet under 480px. Never covers checkout CTA.
- One proactive nudge per session max. Respects dismissal forever.
- Unread dot, no sound. Esc closes. AA contrast. Reduced motion
  disables bounce.
- Auto-collapse on payment and error screens.

## Anti-Clippy rules (load-bearing)

Opt-in. Dismissible. Remembers dismissal. Simple shapes. No repeats.
No cute during money loss. One character never carries every tone.
