# Macham — launch film storyboard

**Deliverable:** demo cut, 52.8s, 16:9, 1920×1080 @ 30fps (rendered at 1.5x device scale,
downscaled on encode). Under 90s, so this is a **demo cut, not a launch master** — one
claim per scene. A master would extend the same timeline to 90s+ with a second storefront.

**Spine:** the product is the **buyer widget on a storefront**. Every frame is the real
`src/widget/assistant.ts` surface, mounted on a neutral host page, driven by a film clock.
The marketing site (`site/`) is never filmed and its tokens never enter the footage.

Beat grid: 0.6s = 100 BPM. Scene boundaries land on beats (8 / 14 / 6 / 7 / 20 / 14 / 8 / 11).

| # | Scene | Start | Dur | Beat | On-screen action | Out |
|---|---|---|---|---|---|---|
| 1 | ColdOpen | 0.0 | 4.8 | The gap | Ink field, two stamped lines: "A storefront has no buyer agent." / "Macham puts one on any store." | brand band wipe |
| 2 | HostShell | 4.8 | 8.4 | The surface | Window wipes up: a plain catalogue page (left rail, three tiles, three rows), the black launcher bottom-right. Captions state the real integration: tag **plus** `Macham.init({ apiKey, tenantId })` | cut |
| 3 | Launcher | 13.2 | 3.6 | The key | Camera punches into the bottom-right corner; cursor travels onto the 60px launcher (`S` = `initialOf("Shop helper")`) | cut |
| 4 | TheAsk | 16.8 | 4.2 | The ask | Click → panel opens (`toggle()`), bot: "Hi, I'm Shop helper. Tell me what you need." → types `i need a parka or a shell` → Send | cut |
| 5 | TheCards | 21.0 | 12.0 | **The money shot** | One beat of waiting, then `chatTurn` → `searchProducts` → `narrateSearch` lands: bot bubble "The Harbor Parka is available for USD 42.00, while the Trail Shell costs USD 46.50." + two `.mcm-card` rows with `.thumb.ph` initials, `priceLabel` prices, "Add", "See at store" | cut |
| 6 | ThePropose | 33.0 | 8.4 | The proposal | Click "Add" on the first card → user bubble `add Harbor Parka to my bag` → `proposeCart` → "Add 1 × Harbor Parka to your bag?" + `.mcm-approve` row (Add to bag / Keep looking) | cut |
| 7 | TheHandoff | 41.4 | 4.8 | The handoff | Click "Add to bag" → the row resolves to "Done." and the proposal leaves through `onProposal` (captured off-screen, printed by the smoke harness) | band wipe |
| 8 | TheStamp | 46.2 | 6.6 | The name | "Macham" stamps, tagline "Any store in, assistance out.", then a small line: "Narration captured live from Macham's own gateway." | hold |

## Camera

The window is not a fixed rect: it **hugs whatever the scene frames**, so there is no dead
space inside it. Boxes are measured from the live product DOM each frame (`.mcm-grid`,
`.mcm-approve`) or pinned to the storefront's own 200px content seam (`PANEL_SPOT`), and
eased across scene boundaries so a reframe reads as one move. The establishing shot and the
panel shots share a ~1040×860 window; the money shot punches to k≈2.6 (13.5px widget type
becomes 35 film px).

## Caption track (burned in, no voiceover)

| Time | Line |
|---|---|
| 0.0 | A storefront has no buyer agent. |
| 2.4 | Macham puts one on any store. |
| 5.4 | One script tag. One init call. |
| 8.6 | Macham.init({ apiKey, tenantId }) — the tag alone does nothing. |
| 13.6 | A publishable key. |
| 16.0 | Safe to expose in a storefront. Not a secret. |
| 17.6 | Ask in plain words. |
| 20.4 | `> i need a parka or a shell` |
| 21.6 | It reads the store's catalogue, not a model's memory. |
| 25.4 | Two rows. Two real prices. No invented product. |
| 30.0 | Written by Macham's gateway, then frozen. |
| 33.6 | The agent proposes. |
| 37.0 | Add 1 × Harbor Parka to your bag? |
| 42.0 | The bag is the store's to change. |
| 45.4 | Done. |
| 46.8 | **Macham** |
| 48.6 | Any store in, assistance out. |
| 50.8 | Narration captured live from Macham's own gateway. |

Every line is either the product's own on-screen string, a verbatim repo phrase
(`package.json` description, the loader's init contract), or plainly true of the frame.
Nothing in the track claims a payment, a dashboard, a latency figure, or a model name.

## Air pockets

- 28.0 → 30.0: nothing new lands; the two cards just sit there (the film's longest hold).
- 51.0 → 52.8: no new type; the wordmark holds while the music resolves.

## Fixture (real, reconciling)

Catalogue rows are the repo's own adapter-test data: Harbor Parka `4200` USD minor,
WordPress Pennant `2500`, Trail Shell `4650`. `priceLabel` renders them as
**USD 42.00 / USD 25.00 / USD 46.50**; the same function draws the host page's rows, so
storefront and widget cannot disagree. The buyer's ask matches two rows (parka, shell);
the card click proposes **1 × Harbor Parka = USD 42.00** — the widget's own wording,
`Add ${qty} × ${title} to your bag?`. No total is computed anywhere on screen, because the
product computes none (the host's cart owns that).
