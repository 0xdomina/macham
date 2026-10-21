# Macham site — landing design note

Surface mode: **Persuade**. Audience: store owners and the developers who integrate Macham; secondarily shoppers. Stack kept: Vite (`index.html` + `src/main.ts` + `src/style.css`), built with `cd macham/site && npm run build`.

## Direction

- **Name + seed:** The quiet instrument (`quiet-instrument`), seed `1224573522`, sector `dev-tool`, drawn 2026-10-21.
- **Type system:** Archivo (400 / 600 only). Monospace appears nowhere on the page except the real install snippet, which is set in a generic `code` stack inside `<pre><code>`.
- **Palette:** "Soot and lime" — kept as the sheet deals it but run **light** (one field change to soot for the guardrails section and the footer), because the primary job is a developer *pasting a line into a light editor*.
- **Redraws (recorded):** `proof` → `proof-plain-columns`. The dealt proof blueprint is a customer-logo row and Macham has no real logos to show; inventing them is forbidden, so it was redrawn to a typographic list of the actual guarantees. All other slots (intro lead-line + four columns, features as a printed menu, how-it-works as call-and-response, cta as a plain sentence) are adopted as dealt. The hero photo-crossfade motion was dropped: there are no product photographs, so the interface fragment is the picture and the approval interaction is the live thing (per the software rule "a product with no photographs shows its own interface built in HTML, never a fake shot").

## Idea (one sentence)

The single line a store owner pastes before `</body>`, and the one **Approve** button that gates every payment, become the whole visual system: a narrow reading column, near-zero ornament, and one real interface fragment that refuses to move until a person presses it. The restraint *is* the claim — the page behaves like the product, which proposes and waits.

**Live thing:** press **Approve $46.50** in the demo and only then does the locked total get asked of PayPal and the settlement anchor appear. Without a press nothing changes; with script off or reduced motion the fragment rests on the "awaiting approval" state, which is itself the message.

## Tokens

Colour (CSS custom properties, no scattered hex): `--paper #f4f2ea` ground · `--surface #eceadb` bar/panel · `--card #fbfaf3` interface surface · `--ink #171710` full text + soot ground · `--soft #4b4a40` secondary · `--muted #6c6b60` captions · `--line #d8d5c6` connectors (interface only) · `--accent #dafa9c` the one action · `--accent-deep #cbee7f` hover · `--on-accent #171710` · `--invert` / `--invert-soft` text on soot. Two non-neutrals total (lime + a deeper lime, one accent family).

Type scale: `--fs-small` 15-16 · `--fs-body` 17-19 · `--fs-lead` 22-26 · `--fs-head` 28-36 · `--fs-display` 36-64. One radius (`--radius 4px`) on the page chrome; the `data-ui` fragment keeps its own. Leading 1.5 body, display tracking -0.02/-0.03em, tabular figures on prices.

## Claims → proof

| Section | Claim (heading carries it) | Proof | Only-Macham because |
| --- | --- | --- | --- |
| Hero | Paste one line. Approve the cart. | Real install snippet; live fragment waiting on one press. | Its whole contract is "proposes, never acts". |
| A buyer, not a seller | Buyer-only, fixed price, human approves. | Four facts: buyer only / one key / any store / you approve (README, AGENT.md, ARCHITECTURE.md). | No seller console, no negotiation — sellers were removed. |
| Live in a paste | One script tag + your own key. | `INTEGRATION.md`: snippet/SDK/extension routes, `mch_` publishable key, model keys server-side. | The store embeds only a key that is safe to expose. |
| Ask, compare, approve | Reads the live catalog; a person gates payment. | Interactive chat fragment: ask → offers at the store's prices → Approve. | Discovery is read-only; approval is human. |
| Nothing moves on its own | Money cannot run without a person. | Orders v2 create→approve→authorize→capture; locked total within tolerance; browser claim is never proof; settlement anchored + fail-closed. | The rails are the product's evidence. |

No pricing section: the repo states no plan prices, so nothing was invented. No "trusted by" strip, no testimonials, no invented metrics.

## Three references (studied, one named steal each)

- **Plastic** (One Page Love, app page) — crop one real object at a viewport corner so the first screen has a subject without a centered mockup. Steal: the corner-cropped artifact; here the artifact is the interface fragment.
- **Gil Huybrecht** (Awwwards SOTD, portfolio — outside this category) — build hierarchy from column position and a one-step indent, all text at one size. Steal: hierarchy without enlarging type, which is how "quiet" stays confident.
- **DialKit** (One Page Love, tool) — place the product's actual controls on the page and let them do the demonstrating. Steal: the real control *is* the hero proof; here the Approve button.

## Sameness test — banned from the first screen

Every AI-commerce landing does: (a) centered headline with a gradient + chatbot mockup and sparkles, (b) three identical icon feature cards, (c) a "trusted by" logo row. All three are banned here: no gradients anywhere, no card trio (the capabilities are a printed menu), no logo strip (none are real).

## House-rule fixes applied to the old site

Removed all five `eyebrow` kickers (info moved into headings/first sentences). Removed JetBrains Mono and Space Grotesk/Inter; Archivo only, monospace restricted to the one real code block. Deleted every gradient (`linear/radial-gradient`), the device-frame phone, the ambient glyph canvas, the scanline/grid overlays, and the pulsing status dot. Replaced scattered hex with tokens. Removed the `root.innerHTML =` page build (a security-floor blocker): markup is now static in `index.html` and `main.ts` touches only `textContent` / `classList` / `createElement`-free DOM.

## Sample content to confirm before launch

Demo store name "Ada's Store"; products Harbor Parka $42.00, Trail Shell $46.50, Field Jacket $49.00; the shopper line "warm jackets under fifty". These are believable sample details for the interface fragment, not real catalog data — replace with the store's own before shipping.

## Gates run

`npm run build` succeeds. `design-taste lint.mjs` on `index.html` + `src/main.ts` + `src/style.css`: **0 FAIL, 0 WARN**. `frontend-craft audit.mjs` on `src`: **0 blockers**. `inspect.mjs` / browser were not run (per instructions).
