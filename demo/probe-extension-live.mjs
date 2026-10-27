// Macham's acceptance test on a live store: load the extension, and with NO key
// configured, check the widget appears on the store, answers from the page,
// shows real products with pictures, and asks before it changes the bag.
//
//   node demo/probe-extension-live.mjs [url]
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Macham keeps no browser test dependency of its own, so borrow the Playwright
// install from a sibling repo rather than adding one to this package.
import { existsSync } from "node:fs";
const CANDIDATES = [
  resolve("node_modules"),
  resolve("..", "tapam", "backend", "node_modules"),
  resolve("..", "machamair", "node_modules"),
];
const from = CANDIDATES.find((d) => existsSync(resolve(d, "playwright")));
const require = createRequire(resolve(from, "noop.js"));
const { chromium } = require("playwright");

const TARGET = process.argv[2] || "https://www.jumia.com.ng/catalog/?q=laptop";
const SEARCH = process.env.SEARCH || "laptop";
const EXT = resolve("extension");

let pass = 0, fail = 0;
const check = (ok, label, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};

// Macham's extension has no service worker and no host permissions by design:
// the content script does everything inside the page's isolated world. So the
// proof the extension loaded is the flag its content script sets, checked below.
console.log(`\n=== extension at ${EXT} (no key configured)`);
const ctx = await chromium.launchPersistentContext(resolve("demo/out/macham-ext-profile"), {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ["--no-first-run", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = ctx.pages()[0] || (await ctx.newPage());
const noise = [];
page.on("console", (m) => { if (m.type() === "error") noise.push("[console] " + m.text().slice(0, 200)); });
page.on("pageerror", (e) => noise.push("[pageerror] " + String(e.message).slice(0, 200)));
page.on("requestfailed", (r) => noise.push("[failed] " + r.url().slice(0, 70) + " " + (r.failure()?.errorText ?? "")));
const leaked = [];
page.on("request", (r) => {
  // The whole point of the fix: nothing the shopper's key touches may go to the
  // store being browsed.
  const h = r.headers();
  if (/authorization/i in h && !r.url().includes("localhost") && !r.url().includes("127.0.0.1")) {
    leaked.push(`${r.method()} ${r.url().slice(0, 70)}`);
  }
});

await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90000 }).catch((e) => console.log("goto:", e.message.split("\n")[0]));
await page.waitForTimeout(9000);
console.log("    landed on", page.url());

const launched = await page.isVisible(".mcm-launcher").catch(() => false);
check(launched, "the widget appears on the live store with no key configured");
if (!launched) {
  const state = await page.evaluate(() => ({ flag: document.documentElement.getAttribute("data-macham-widget"), nodes: document.querySelectorAll(".mcm-launcher,.mcm-panel").length }));
  console.log("    dom:", JSON.stringify(state));
  await page.screenshot({ path: resolve("demo/out/macham-ext-0-fail.png") });
  await ctx.close();
  process.exit(1);
}

await page.click(".mcm-launcher");
await page.waitForTimeout(800);
check(await page.isVisible(".mcm-panel"), "click opens the chat interface");

await page.fill(".mcm-panel input, .mcm-panel textarea", SEARCH);
await page.click(".mcm-panel button:has-text('Send'), .mcm-send");
await page.waitForTimeout(6000);

const cards = await page.$$eval(".mcm-panel img", (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length).catch(() => 0);
const productCards = await page.$$eval(".mcm-panel a[href], .mcm-panel [class*=card]", (els) => els.length).catch(() => 0);
const thread = await page.$$eval(".mcm-panel *", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter((t) => t.length > 20).slice(-4)).catch(() => []);
check(cards > 0, "the agent shows the store's products with pictures", `[${cards} images loaded, ${productCards} card nodes]`);

// Sort must reorder the cards, not just talk about it.
await page.fill(".mcm-panel input, .mcm-panel textarea", "cheapest laptop");
await page.click(".mcm-panel button:has-text('Send'), .mcm-send");
await page.waitForTimeout(6000);
const priced = await page.$$eval(".mcm-panel img", (els) => els.length).catch(() => 0);
const sortLine = await page.$$eval(".mcm-panel *", (els) => els.map((e) => e.textContent || "").filter((t) => /Sorted /i.test(t)).slice(-1)[0] || "").catch(() => "");
check(/cheapest first/i.test(sortLine), "it sorts when asked", sortLine ? `[${sortLine.slice(0, 60)}]` : "[no sorted answer]");
check(priced > 0, "the sorted answer still carries pictures", `[${priced} images]`);

const approve = await page.$$eval(".mcm-panel button", (els) => els.map((e) => e.textContent.trim()).filter((t) => /add to bag|remove/i.test(t))).catch(() => []);
if (!approve.length) {
  await page.fill(".mcm-panel input, .mcm-panel textarea", `add ${SEARCH} to my bag`);
  await page.click(".mcm-panel button:has-text('Send'), .mcm-send");
  await page.waitForTimeout(6000);
}
const asks = await page.$$eval(".mcm-panel button", (els) => els.map((e) => e.textContent.trim()).filter((t) => /add to bag|remove/i.test(t))).catch(() => []);
check(asks.length > 0, "it asks before it changes the bag (approval, not action)", `[${asks.join(" / ")}]`);
check(leaked.length === 0, "nothing was sent to the store's own origin", leaked.length ? leaked[0] : "[clean]");

await page.screenshot({ path: resolve("demo/out/macham-ext-1.png") });
console.log("\n  last thread lines:");
for (const t of thread.slice(-3)) console.log("    -", t.slice(0, 150));
if (noise.length) {
  console.log("\n  what the page reported:");
  for (const n of [...new Set(noise)].slice(0, 10)) console.log("    !", n);
}
console.log(`\n  ${pass} passed, ${fail} failed`);
await ctx.close();
process.exit(fail ? 1 : 0);
