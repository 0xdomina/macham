// The dock, on macham's own widget: the bubble is a handle, the panel is glass,
// and neither is pinned to a corner. Runs offline against demo/dock-probe.html.
//
//   node demo/probe-dock.mjs
//
// Needs demo/build/dock-probe.js (`npx esbuild demo/dock-probe-entry.ts
// --bundle --format=iife --outfile=demo/build/dock-probe.js --target=es2020`)
// and devstore's :4173 for the hero photo; the page still works without it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const CANDIDATES = [resolve("node_modules"), resolve("..", "tapam", "backend", "node_modules"), resolve("..", "machamair", "node_modules")];
const from = CANDIDATES.find((d) => existsSync(resolve(d, "playwright")));
const require = createRequire(resolve(from, "noop.js"));
const { chromium } = require("playwright");

const PORT = 8914;
const server = spawn(process.execPath, ["demo/serve.mjs"], { env: { ...process.env, FILM_PORT: String(PORT) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 600));

let pass = 0, fail = 0;
const check = (ok, label, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/dock-probe.html`, { waitUntil: "load" });
  await page.waitForSelector(".mcm-launcher", { timeout: 10000 });
  await page.waitForTimeout(300);

  const box = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, open: !!document.querySelector(s) && !document.querySelector(s).hasAttribute("hidden") };
  }, sel);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("macham_dock:localhost:" + location.port) || "null"));

  const l0 = await box(".mcm-launcher");
  check(true, "the bubble mounts");
  check(l0.right > 1160 && l0.bottom > 760, "starts bottom-right", `${Math.round(l0.right)},${Math.round(l0.bottom)}`);

  await page.click(".mcm-launcher");
  await page.waitForTimeout(250);
  const p0 = await box(".mcm-panel");
  const glass = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".mcm-panel"));
    const l = getComputedStyle(document.querySelector(".mcm-launcher"));
    return { blur: s.backdropFilter || s.webkitBackdropFilter, bg: s.backgroundColor, launchBg: l.backgroundColor };
  });
  check(/blur\(20px\)/.test(glass.blur) && /saturate/.test(glass.blur), "the panel is frosted glass", glass.blur);
  check(/rgba\(255, 255, 255, 0\.7\)/.test(glass.bg), "the panel is translucent", glass.bg);
  check(/rgba\(10, 10, 10, 0\.9\)/.test(glass.launchBg), "the bubble is smoked glass, not a flat disc", glass.launchBg);
  check(p0.open && p0.x >= 0 && p0.y >= 0 && p0.right <= 1200.5 && p0.bottom <= 800.5, "the open panel is fully on screen",
    `[${Math.round(p0.x)},${Math.round(p0.y)} ${Math.round(p0.right)}x${Math.round(p0.bottom)}]`);
  check(p0.bottom <= l0.y + 1, "opens above a bottom dock");

  // A foreign price gets an estimate only because the host supplied a rate.
  await page.fill(".mcm-bar input", "necklace");
  await page.press(".mcm-bar input", "Enter");
  const card = await page.waitForSelector(".mcm-card", { timeout: 20000 }).catch(() => null);
  const est = card ? await page.$eval(".mcm-card .fx", (e) => e.textContent.trim()).catch(() => "") : "";
  check(/≈ USD 43.22/.test(est), "a foreign price carries a marked estimate", `[${est}]`);
  await page.click(".mcm-launcher");
  await page.waitForTimeout(150);

  // Drag to the upper left.
  await page.mouse.move(l0.x + l0.w / 2, l0.y + l0.h / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(l0.x + l0.w / 2 + ((160 - (l0.x + l0.w / 2)) * i) / 8, l0.y + l0.h / 2 + ((120 - (l0.y + l0.h / 2)) * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const l1 = await box(".mcm-launcher");
  check(l1.x === 16, "a drag snaps the bubble to the near edge", `x=${l1.x}`);
  check((await stored())?.x === 16, "and the spot is remembered", JSON.stringify(await stored()));
  check(!(await box(".mcm-panel")).open, "the drag is not also a click");

  await page.click(".mcm-launcher");
  await page.waitForTimeout(250);
  const p1 = await box(".mcm-panel");
  check(Math.abs(p1.x - l1.x) < 1 && p1.y > l1.y, "a left dock opens below, aligned to the bubble", `panel=${Math.round(p1.x)},${Math.round(p1.y)}`);
  await page.screenshot({ path: "demo/out/dock-open.png" });

  // Header handle.
  const g = await page.evaluate(() => {
    const r = document.querySelector(".mcm-grip").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + ((1100 - g.x) * i) / 8, g.y + ((140 - g.y) * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const l2 = await box(".mcm-launcher");
  check(l2.x > 1000, "the header moves the whole dock", `x=${Math.round(l2.x)}`);
  check((await box(".mcm-panel")).open, "the panel stays open through the move");

  await page.focus(".mcm-launcher");
  const b = await box(".mcm-launcher");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  check(Math.round(b.x - (await box(".mcm-launcher")).x) === 32, "arrow keys move the dock");

  const before = await box(".mcm-launcher");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".mcm-launcher");
  await page.waitForTimeout(400);
  const after = await box(".mcm-launcher");
  check(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, "the dock survives a reload",
    `${Math.round(before.x)},${Math.round(before.y)} -> ${Math.round(after.x)},${Math.round(after.y)}`);

  const css = await page.evaluate(() => document.getElementById("mcm-css").textContent);
  check(/prefers-reduced-transparency/.test(css) && /@supports not \(\(backdrop-filter/.test(css), "glass has opaque fallbacks");
  check(errs.length === 0, "no page errors", errs[0] || "");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
  server.kill();
}
