// Deterministic frame renderer for the macham film.
//   node demo/record.mjs --smoke          spot frames + transcript + click misses
//   node demo/record.mjs                  full render at 30fps into demo/out/frames
// Never screen-records: every frame is seeked to, then screenshotted.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : i >= 0 ? true : dflt;
};

const FPS = Number(arg("fps", 30));
const DSF = Number(arg("dsf", 1.5));   // 2880x1620 master, downscaled on encode
const TOTAL = 52.8;
const PORT = Number(process.env.FILM_PORT || 8913);
const OUT = join(HERE, arg("out", "out/frames"));
const NO_CAP = Boolean(arg("no-captions", false));
const SMOKE = Boolean(arg("smoke", false));
const SPOTS = [0.9, 5.6, 9.4, 14.2, 18.4, 20.1, 22.6, 27.4, 31.2, 35.4, 39.0, 43.2, 45.0, 48.4, 51.4];

// Macham vendors no browser tooling, and this rig must not add a dependency to
// the app's package.json. Resolve Playwright from the local repo, then from any
// sibling checkout that already vendors it.
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {}
  const candidates = [
    process.env.FILM_PLAYWRIGHT_ROOT,
    join(ROOT, "node_modules"),
    resolve(ROOT, "..", "tapam", "backend"),
    resolve(ROOT, "..", "tapam"),
  ].filter(Boolean);
  for (const base of candidates) {
    try {
      const req = createRequire(join(base, "noop.js"));
      const mod = req("playwright");
      if (mod?.chromium) {
        console.log("playwright from " + base);
        return mod;
      }
    } catch {}
  }
  throw new Error(
    "Playwright is not installed here. Set FILM_PLAYWRIGHT_ROOT to a directory whose node_modules has it, " +
    "or run `npm i -D playwright` outside the app manifest."
  );
}

const { chromium } = await loadPlaywright();
await import("./serve.mjs");

const vclock = await readFile(join(HERE, "vclock.js"), "utf8");
const browser = await chromium.launch({
  channel: process.env.FILM_CHANNEL || "chrome",
  args: ["--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none", "--hide-scrollbars"],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: DSF,
});
await ctx.addInitScript({ content: vclock });
if (NO_CAP) await ctx.addInitScript({ content: "window.__NO_CAPTIONS=true" });

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__FILM_READY === true, null, { timeout: 20000 });
await page.evaluate(async () => {
  await document.fonts.ready;
  await window.__filmSeek(0);
});
// one settle pass so the product document exists and fonts are warm before frame 0
await page.evaluate(async () => {
  const w = document.getElementById("app").contentWindow;
  if (w && w.__realSetTimeout) await new Promise((r) => w.__realSetTimeout(r, 50));
});

if (SMOKE) {
  const dir = join(HERE, "out", "smoke");
  await mkdir(dir, { recursive: true });
  const all = [];
  for (const t of SPOTS) {
    const info = await page.evaluate((time) => window.__filmSeek(time), t);
    const file = join(dir, `spot-${String(t).replace(".", "p")}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    const misses = await page.evaluate(() => (window.__clickReport || []).filter((r) => !r.ok));
    const row = { spot: t, scene: info.scene, cam: info.cam, seq: info.seq, misses, file, dom: info.dom };
    all.push(row);
    const c = info.cam || {};
    const vis = `k=${(c.k ?? 0).toFixed(2)} frame=${(c.frame || []).join("x")} box=${(c.box || []).join("x")}`;
    console.log(JSON.stringify({ spot: t, scene: info.scene, seq: info.seq, misses }) + "  " + vis);
    console.log("   log " + ((info.log || []).join(" | ") || "(no fetch yet)"));
    console.log("   open=" + info.dom?.open + " grids=" + info.dom?.gridCount + " approve=" + (info.dom?.approve || "-"));
    for (const m of info.dom?.messages || []) console.log("   msg " + m);
    for (const c of info.dom?.cards || []) console.log("   card " + c);
    if (info.dom?.proposal) console.log("   proposal " + JSON.stringify(info.dom.proposal));
  }
  await writeFile(join(HERE, "out", "smoke-dom.json"), JSON.stringify(all, null, 2));
  console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 10).join("\n") : "no page errors");
  await browser.close();
  process.exit(0);
}

await mkdir(OUT, { recursive: true });
const frames = Math.round(TOTAL * FPS);
let made = 0;
const t0 = Date.now();
for (let f = 0; f <= frames; f++) {
  const file = join(OUT, `f${String(f).padStart(5, "0")}.png`);
  const t = Math.min(f / FPS, TOTAL - 1e-4);
  if (existsSync(file)) continue;
  await page.evaluate((time) => window.__filmSeek(time), t);
  await page.screenshot({ path: file });
  made++;
  if (made % 150 === 0) {
    const per = (Date.now() - t0) / made;
    console.log(`${made} frames, ${(per / 1000).toFixed(2)}s/frame, ~${(((frames - f) * per) / 1000 / 60).toFixed(1)}min left`);
  }
}
await writeFile(join(HERE, "out", "render-errors.txt"), errors.join("\n") || "none");
console.log(JSON.stringify({ frames: frames + 1, made, seconds: ((Date.now() - t0) / 1000).toFixed(1), errors: errors.length }));
await browser.close();
process.exit(errors.length > 40 ? 1 : 0);
