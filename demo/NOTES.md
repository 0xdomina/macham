# Reconstruction notes — what the film shows and where it comes from

## Method

The film is **not a rebuild**. It photographs the product's own surface:
`src/widget/assistant.ts` is bundled for the browser (`demo/build.mjs` → esbuild, the repo's
own dev dependency), mounted by `demo/storefront.html`, and driven inside a capture iframe by
a virtual clock. Nothing in `demo/` re-implements the widget, and no marketing-site token
(`site/`: Archivo, `--paper:#f4f2ea`, `--accent:#dafa9c`) appears in a single frame.

`demo/vclock.js` is installed in every frame before any product script runs. It replaces
`setTimeout`/`setInterval` with a queue advanced only by the film clock, pins `Date` and
`Math.random` to a seed, neutralises `scrollIntoView` and `focus()` scrolling (the camera
frames the product; the page never scrolls itself — the widget's own
`thread.scrollTop = scrollHeight` is left working), and answers `fetch` from a frozen
transcript in strict call order. Two hard rules make mistakes loud:

- an unrecorded route returns **410**, never a hang;
- each transcript entry carries the **request body it actually answers**
  (`fixtures/assist-1.request.json`). If the widget ever sends a prompt that is not the one
  that was captured, the frame fails closed rather than showing a model's answer to a
  question the buyer never asked.

So a given film time always yields identical pixels — the requirement for frame-by-frame
capture. The render never touches the network: the gateway is only used once, offline, by
`demo/capture.mjs`, to produce the transcript.

## Surface → code map

| On screen | Source |
|---|---|
| Black 60px launcher with the letter "S" | `.mcm-launcher`, `initialOf(identity.name)` — `assistant.ts:41,70-73,110` |
| Panel, head "Shop helper" + "AI assistant" | `.mcm-panel` / `.mcm-head` — `assistant.ts:42-44,111-112` (default identity, `assistant/identity.ts:24-29`) |
| "Hi, I'm Shop helper. Tell me what you need." | `toggle()` — `assistant.ts:231-238` |
| Input "Ask about products" + "Send" | `.mcm-bar` — `assistant.ts:62-64,114` |
| User / bot bubbles | `paint()` → `.mcm-user` / `.mcm-bot` — `assistant.ts:124-133` |
| Narration sentence | `chatTurn` → `classifyBuyerIntent` → `searchProducts` → `narrateSearch` (`buyer/chat.ts:64-80`, `buyer/intent.ts:24-38`, `buyer/shop.ts:40-80`) through `Harness.run` (`safety/harness.ts:131-150`) and `MachamCloudProvider.chat` (`providers/cloud.ts:24-48`) |
| Two product cards, `.thumb.ph` initials, prices, "Add", "See at store" | `paint()` grid branch — `assistant.ts:156-206`; price text is `priceLabel` (`buyer/shop.ts:28-34`) |
| "add Harbor Parka to my bag" (re-sent by the card) | `add.onclick` — `assistant.ts:191` |
| "Add 1 × Harbor Parka to your bag?" + Add to bag / Keep looking | `proposeCart` (`buyer/shop.ts:123-142`) → wording at `buyer/chat.ts:54-57` → `.mcm-approve` at `assistant.ts:134-155` |
| "Done." and the proposal leaving the widget | approve handler → `"Done."` (`assistant.ts:140-147`) and `opts.onProposal?.(proposal)` (`assistant.ts:141`) |
| The host page's own rows and prices | `demo/storefront.html` drawing `FILM_PRODUCTS` through the same `priceLabel` |

## Fixture provenance — every number is real code output

Catalogue rows are **committed repo data**, taken from the upstream adapter contract tests in
`test/universal.test.mjs` (the shapes each real lane produces), not invented for the film:

| Row | Source | `priceLabel` output |
|---|---|---|
| Harbor Parka | `test/universal.test.mjs:22,30,43` (Shopify lane, `amountMinor: 4200`, USD) | `USD 42.00` |
| WordPress Pennant | `test/universal.test.mjs:53-58,74` (Woo lane, `2500`, USD) | `USD 25.00` |
| Trail Shell | `test/universal.test.mjs:81,99` (JSON-LD lane, `"46.50"` → `4650`, USD) | `USD 46.50` |

`demo/store-fixture.ts` records the line numbers next to each row. One consistent set is used
throughout; the NGN mock rows (`src/adapters/mock.ts:4-19`) and the EUR rows
(`test/lanes.test.mjs:43-55`) were left out to keep a single currency on screen.

**The narration was captured live, not stubbed.** `demo/capture.mjs`:

1. boots the product's own gateway — `node server/assist.mjs` — with `KEYSTORE_PATH` pointed
   at `demo/out/scratch/keystore.json` (the repo's real `data/keystore.json` is never opened;
   its mtime is unchanged) on a freshly allocated free port, and confirms `/health` reports
   `plan` so it knows it is talking to *this* repo's gateway and not another local service;
2. mints a scratch key with `node server/keys.mjs mint --env test`
   (`key_b8f77ea7`, `mch_test`, assist+catalog scopes, no orders scope);
3. runs the **real buyer loop** (`createFilmHarness` + `chatTurn`) with
   `MachamCloudProvider` pointed at that gateway, teeing the exact request and response;
4. freezes `{"text":"{ \"summary\": … }"}` into `demo/fixtures/assist-1.json`.

The sentence on screen — *"The Harbor Parka is available for USD 42.00, while the Trail Shell
costs USD 46.50."* — is model output produced by that call on 2026-10-22, contract-checked by
`searchContract` on the first attempt. `demo/fixtures/assist-1.meta.json` records
`"stub": false`; if you re-run the capture with `--stub`, it writes `"stub": true` and the
film's own footnote becomes false, which is the point of recording it.

Safety: the gateway child process loads `.env` itself. No script in `demo/` reads, prints,
copies or logs any value from `.env`; the minted key is written only to `demo/out/scratch/`
(gitignored) and never appears in the bundle, the transcript, or these notes. No funded key
was used, no orders scope was granted, and no `/v1/orders` call was made.

## Deliberate reconstruction choices (and why)

1. **The storefront is a neutral host shell, not a customer.** `demo/storefront.html` is
   plain system UI on white with grey hairlines and the literal label "neutral host shell".
   It invents no brand, no logo and no copy beyond structural words (Catalogue, Orders, Bag),
   because the widget sets **no `font-family` of its own** and inherits its host — a branded
   fake store would have dressed the product in somebody else's type. Its 200px left rail also
   gives the camera a clean vertical seam to crop on.
2. **No product photography.** The repo's only image URLs are placeholders
   (`https://x/img.jpg`) and the render is offline, so every card is drawn in the widget's
   genuine no-image state: `.thumb.ph`, a letter in a `#F5F5F5` tile (`assistant.ts:171-175`).
   Nothing was hotlinked and no invented "brand photo" was generated to fill the tile.
3. **The film's key is synthetic.** `mch_test_0000…_deadbeef` satisfies `isKeyShape`
   (`auth/key-shape.ts:6`) and exists in no keystore. The minted capture key is a different,
   scratch-only value. The bundle therefore cannot reach a live account even by accident.
4. **One 600ms beat of waiting is pacing, not measurement.** The transcript stores the answer,
   not the real call's duration; the frozen delay exists so the gap between pressing Send and
   the answer landing sits on the grid. No latency is claimed anywhere in the film.
5. **The window hugs its subject.** Rather than a fixed "browser" frame with letterboxing, the
   capture window is resized per scene from a DOM-measured box, so the widget is never cropped
   and the frame is never padded with dead space.
6. **Type renders on the system stack.** Chrome's default UI font is what the widget actually
   draws on this machine; the film matches the product rather than an intent, and stays
   offline-deterministic (no remote fonts).
7. **The caption rail greys are lifted.** `#6B6B6B` on `#0A0A0A` is the widget's own secondary
   colour on a white surface; on the film's black ground it drops below legibility, so the rail
   uses `#A8A8A8`/`#7E7E7E`. The product surface itself is untouched.

## One product defect fixed to film (genuine, committed with the film)

`.mcm-panel` declares `display:flex` (`assistant.ts:42`) while the widget opens and closes it
with the `hidden` attribute (`assistant.ts:111,233`). An author-level `display` beats the UA
`[hidden]{display:none}`, so **the panel rendered open on every mount** — the launcher click
only changed the thread's contents. The film's "click the launcher, the panel opens" beat is
unfilmable until that is true, so `assistantCss()` gained one rule:

```css
.mcm-panel[hidden]{display:none}
```

`npx tsc --noEmit` is clean and `npm test` is 48/48 with it.

## Claims the film deliberately does not make

- **No "paste the tag and it works".** `src/loader.ts:34-43` finds the script tag and does
  *not* auto-initialise; `Macham.init({ apiKey, tenantId })` is mandatory. The film says so in
  so many words at 8.6s.
- **No dashboard, no key-rotation UI, no revoke screen.** Keys come from
  `node server/keys.mjs mint|revoke|list`; `docs/KEYS.md` describes a UI that does not exist.
  Nothing in the footage implies one. (The 401 string in `providers/cloud.ts:41` even says
  "Check the dashboard" — the film never reaches that path.)
- **No avatar.** `assistant/identity.ts` parses `mode:"procedural"`, `style:"beam"` and a
  palette, but the bubble draws a letter only. The film shows the letter.
- **No payment, no checkout, no rail.** `POST /v1/orders` (PayPal capture), Rialo settlement,
  Kernel, Channel3 and Elastic are all unexercised by these frames, so none of them appears,
  is named, or is implied. The last claim the film makes is a *proposal* and a `Done.` —
  the bag belongs to the store.
- **No invented total.** The widget computes no cart total, so none is shown or captioned.
- **No borrowed marketing markup.** `site/index.html:48-50` is static fake product text
  ("Ada's Store", Harbor Parka $42.00 …) and is not used as a fixture; `docs/UI_SYSTEM.md`
  tokens are aspirational and unimported; `docs/FEATURES.md`'s "43/43 tests green" is a claim,
  not code, and is not repeated.
- **No live network in the render.** The words are genuinely the gateway's; the pixels are
  reproducible from disk.

## Reproduce

```sh
node demo/build.mjs          # esbuild: demo/build/macham-film.js + film-core.mjs
node demo/capture.mjs        # live gateway capture -> demo/fixtures/assist-1.*
node demo/record.mjs --smoke # spot frames + fetch transcript + click misses + DOM probe
node demo/record.mjs --fps 30
node demo/assemble.mjs       # encode + sound + mix + master
```

`record.mjs` launches the **installed Chrome** (`channel: "chrome"`); it never downloads a
browser and adds nothing to the app's `package.json`. Macham vendors no Playwright, so the
resolver falls back to a sibling checkout that does (`FILM_PLAYWRIGHT_ROOT` overrides it).
The smoke pass prints, per spot: the scene, the camera box, the fetch transcript (any `410`
or `body mismatch` is a failure), every click that found no element, and the widget's own DOM
(messages, cards with their `priceLabel` text, approval row, and the `onProposal` payload).
