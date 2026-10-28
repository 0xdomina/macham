import "./style.css";

// Macham site: the hero is a live agent run. Everything here is local and
// deterministic. No network calls, no fake receipts.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduced ? 0 : ms));

type Item = { id: string; title: string; price: number; tags: string[] };
type Line = { item: Item; qty: number };

const CATALOG: Item[] = [
  { id: "hp-1", title: "Wireless over-ear headphones, ANC", price: 79, tags: ["headphones", "headphone", "wireless", "bluetooth", "over-ear", "anc", "noise", "cancelling", "audio"] },
  { id: "hp-2", title: "Wireless earbuds, sport fit", price: 49, tags: ["earbuds", "earbud", "wireless", "bluetooth", "sport", "audio", "headphones"] },
  { id: "hp-3", title: "Budget wired headphones", price: 19, tags: ["headphones", "headphone", "wired", "budget", "audio"] },
  { id: "hp-4", title: "Studio wireless headphones, 40h", price: 149, tags: ["headphones", "headphone", "wireless", "studio", "audio", "bluetooth"] },
  { id: "hp-5", title: "Gaming headset with mic", price: 59, tags: ["headset", "gaming", "mic", "headphones", "headphone", "wired", "audio"] },
  { id: "sp-1", title: "Portable bluetooth speaker", price: 39, tags: ["speaker", "bluetooth", "wireless", "portable", "audio"] },
  { id: "tee-1", title: "Tee, black", price: 25, tags: ["tee", "shirt", "black", "cotton", "clothing"] },
  { id: "cap-1", title: "Cap, olive", price: 8, tags: ["cap", "hat", "olive", "clothing"] },
];
const STOP = new Set(["a", "an", "the", "i", "want", "need", "some", "for", "with", "and", "or", "of", "to", "me", "please", "show", "find", "get", "under", "below", "less", "than", "max", "around", "about", "in", "is", "any"]);

const money = (n: number) => n.toFixed(2) + " USD";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ── reveal on scroll ──
const rise = Array.from(document.querySelectorAll<HTMLElement>(".node, .card, .try, .snippet-card"));
if (!reduced && "IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.2 });
  rise.forEach((el) => io.observe(el));
} else rise.forEach((el) => el.classList.add("in"));

// ── copy ──
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
  const original = btn.textContent ?? "Copy";
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("install-code").textContent ?? ""); btn.textContent = "Copied"; }
    catch { btn.textContent = "Select text"; }
    setTimeout(() => (btn.textContent = original), 1400);
  });
});

// ── shared: a thread that can hold bubbles and offers ──
function bubble(thread: HTMLElement, kind: "agent" | "user", text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "msg " + kind;
  el.textContent = text;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  return el;
}
function offers(thread: HTMLElement, items: Item[], onAdd: (it: Item, btn: HTMLButtonElement) => void): HTMLElement[] {
  const wrap = document.createElement("div");
  wrap.className = "offers";
  thread.appendChild(wrap);
  const rows = items.map((it, i) => {
    const row = document.createElement("div");
    row.className = "offer";
    row.dataset.id = it.id;
    row.style.transitionDelay = (i * 160) + "ms";
    const label = document.createElement("span");
    label.innerHTML = "<em>" + (i + 1) + "</em>" + it.title + " " + money(it.price);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "add";
    btn.textContent = "Add";
    btn.addEventListener("click", () => onAdd(it, btn));
    row.append(label, btn);
    wrap.appendChild(row);
    return row;
  });
  thread.scrollTop = thread.scrollHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => rows.forEach((r) => r.classList.add("in"))));
  return rows;
}
function countUp(el: HTMLElement, from: number, to: number, ms = 700): void {
  if (reduced) { el.textContent = money(to); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = money(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function cartLine(lines: HTMLElement, it: Item, qty: number): void {
  const row = document.createElement("div");
  row.className = "ln";
  row.dataset.id = it.id;
  row.innerHTML = "<span></span><span></span>";
  row.children[0].textContent = it.title + (qty > 1 ? " x" + qty : "");
  row.children[1].textContent = money(it.price * qty);
  lines.appendChild(row);
}

// ── the hero: a scripted live run of the real agent ──
const demoThread = $("demo-thread");
const demoCart = $("demo-cart");
const demoLines = $("demo-lines");
const demoTotal = $("demo-total");
const demoTyped = $("demo-typed");
const demoApprove = $<HTMLButtonElement>("demo-approve");
const demoApproveText = $("demo-approve-text");
const cursor = $("cursor");
const win = $("demo");

function moveCursor(target: HTMLElement | null): Promise<void> {
  if (!target) return Promise.resolve();
  const box = win.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  cursor.style.transform = `translate(${r.left - box.left + r.width / 2 - 4}px, ${r.top - box.top + r.height / 2 - 4}px)`;
  cursor.classList.add("on");
  return wait(reduced ? 0 : 950);
}
async function press(el: HTMLElement): Promise<void> {
  cursor.classList.add("click");
  el.classList.add("pressed");
  await wait(160);
  el.classList.remove("pressed");
  cursor.classList.remove("click");
}
async function typeInto(el: HTMLElement, text: string): Promise<void> {
  el.textContent = "";
  for (const ch of text) { el.textContent += ch; await wait(reduced ? 0 : 55); }
}

let demoRunning = false;
async function runDemo(): Promise<void> {
  if (demoRunning) return;
  demoRunning = true;
  while (true) {
    demoThread.textContent = "";
    demoLines.textContent = "";
    demoCart.hidden = true;
    demoTotal.textContent = money(0);
    demoTotal.classList.remove("lock");
    demoApprove.disabled = true;
    demoApprove.classList.remove("approved");
    demoApproveText.textContent = "Approve total";
    cursor.classList.remove("on");
    demoTyped.textContent = "";
    await wait(900);

    await typeInto(demoTyped, "wireless headphones under 100");
    await wait(300);
    demoTyped.textContent = "";
    bubble(demoThread, "user", "wireless headphones under 100");
    await wait(700);
    bubble(demoThread, "agent", "3 matches under 100 USD. Add what you want.");
    await wait(400);

    const picks = [CATALOG[1], CATALOG[0], CATALOG[2]];
    const rows = offers(demoThread, picks, () => undefined);
    await wait(1100);

    const total = { v: 0 };
    const add = async (it: Item, rowIdx: number) => {
      const btn = rows[rowIdx].querySelector<HTMLButtonElement>(".add")!;
      await moveCursor(btn);
      await press(btn);
      btn.textContent = "Added";
      btn.classList.add("done");
      const prev = total.v;
      total.v += it.price;
      if (demoCart.hidden) demoCart.hidden = false;
      cartLine(demoLines, it, 1);
      countUp(demoTotal, prev, total.v);
      await wait(750);
    };
    await add(picks[0], 0);
    await add(picks[1], 1);

    bubble(demoThread, "agent", "Cart ready. One total to approve.");
    await wait(500);
    demoTotal.classList.add("lock");
    demoApprove.disabled = false;
    demoApproveText.textContent = "Approve " + money(total.v);
    await moveCursor(demoApprove);
    await wait(500);
    await press(demoApprove);
    demoApprove.classList.add("approved");
    demoApproveText.textContent = "Approved " + money(total.v);
    bubble(demoThread, "agent", "Approved. PayPal captures " + money(total.v) + ".");
    await wait(3600);
    cursor.classList.remove("on");
    await wait(600);
  }
}
if (win) {
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) runDemo();
  }, { threshold: 0.3 });
  io.observe(win);
}

// ── the extension: popup opens on the mascot, types, reads the page ──
const extBrowser = $("ext-browser");
const extCursor = $("ext-cursor");
const extPopup = $("ext-popup");
const extTyped = $("ext-typed");
const extReply = $("ext-reply");
const extTool = document.querySelector<HTMLElement>(".tool")!;

async function runExt(): Promise<void> {
  while (true) {
    extPopup.classList.remove("open");
    extTool.classList.remove("lit");
    extTyped.textContent = "";
    extReply.textContent = "";
    extCursor.classList.remove("on");
    await wait(1000);

    const box = extBrowser.getBoundingClientRect();
    const t = extTool.getBoundingClientRect();
    extCursor.style.transform = `translate(${t.left - box.left + 8}px, ${t.top - box.top + 10}px)`;
    extCursor.classList.add("on");
    await wait(reduced ? 0 : 1000);
    await press(extTool);
    extTool.classList.add("lit");
    extPopup.classList.add("open");
    await wait(500);

    await typeInto(extTyped, "earbuds, sport, under 60");
    await wait(400);
    const go = extPopup.querySelector<HTMLElement>(".pop-go")!;
    const gb = go.getBoundingClientRect();
    extCursor.style.transform = `translate(${gb.left - box.left + 12}px, ${gb.top - box.top + 6}px)`;
    await wait(reduced ? 0 : 900);
    await press(go);
    extReply.innerHTML = "<b>Reading this page.</b> Found 2 matches under 60 USD.";
    await wait(4200);
  }
}
{
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); runExt(); }
  }, { threshold: 0.3 });
  io.observe(extBrowser);
}

// ── try it: the same rule-based agent, typed by you ──
const tryThread = $("try-thread");
const tryCart = new Map<string, Line>();
const tryLines = $("try-lines");
const tryTotal = $("try-total");
const tryCartBox = $("try-cart");
const tryApprove = $<HTMLButtonElement>("try-approve");
let lastOffers: Item[] = [];
let greeted = false;

function renderTry(): void {
  tryLines.textContent = "";
  let total = 0, count = 0;
  tryCart.forEach((l) => { cartLine(tryLines, l.item, l.qty); total += l.item.price * l.qty; count += l.qty; });
  countUp(tryTotal, 0, total, 400);
  tryTotal.classList.toggle("lock", count > 0);
  tryCartBox.hidden = count === 0;
  tryApprove.disabled = count === 0;
  tryApprove.textContent = count === 0 ? "Approve total" : "Approve " + money(total);
}
function addTry(it: Item): void {
  const cur = tryCart.get(it.id);
  tryCart.set(it.id, { item: it, qty: (cur ? cur.qty : 0) + 1 });
  renderTry();
  bubble(tryThread, "agent", "Added " + it.title + ".");
}
function parseBudget(text: string): number | null {
  const m = text.match(/(?:under|below|less than|max|up to|<|within)\s*\$?\s*(\d+(?:\.\d+)?)/i) || text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function search(text: string): Item[] {
  const budget = parseBudget(text);
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+(\.\d+)?$/.test(w));
  let pool = CATALOG.map((it) => {
    let score = 0;
    for (const w of words) {
      if (it.tags.includes(w)) score += 3;
      else if (it.title.toLowerCase().includes(w)) score += 2;
      else if (it.tags.some((t) => t.startsWith(w) || w.startsWith(t))) score += 1;
    }
    return { it, score };
  }).filter((s) => s.score > 0);
  if (budget !== null) pool = pool.filter((s) => s.it.price <= budget);
  pool.sort((a, b) => b.score - a.score || a.it.price - b.it.price);
  return pool.slice(0, 3).map((s) => s.it);
}
function handle(raw: string): void {
  const text = raw.trim();
  if (!text) return;
  bubble(tryThread, "user", text);
  const lower = text.toLowerCase();
  const m = lower.match(/^(?:add|buy|get)\s+(?:the\s+)?(first|second|third|one|two|three|1|2|3)\b/);
  if (m) {
    const map: Record<string, number> = { first: 0, one: 0, "1": 0, second: 1, two: 1, "2": 1, third: 2, three: 2, "3": 2 };
    const pick = lastOffers[map[m[1]]];
    if (pick) addTry(pick); else bubble(tryThread, "agent", "Ask for something first.");
    return;
  }
  if (lower === "clear") { tryCart.clear(); renderTry(); bubble(tryThread, "agent", "Cart cleared."); return; }
  const found = search(text);
  if (found.length === 0) {
    lastOffers = [];
    bubble(tryThread, "agent", "No match. Try headphones, earbuds, speaker, tee, or cap. Add a budget like under 60.");
    return;
  }
  lastOffers = found;
  const budget = parseBudget(text);
  bubble(tryThread, "agent", found.length + " matches" + (budget !== null ? " under " + budget + " USD" : "") + ". Tap Add.");
  offers(tryThread, found, (it, btn) => { addTry(it); btn.textContent = "Added"; btn.classList.add("done"); });
}
if (!greeted) { greeted = true; bubble(tryThread, "agent", "What do you need from this store?"); }

$<HTMLFormElement>("try-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("try-input");
  const v = input.value;
  input.value = "";
  handle(v);
});
tryApprove.addEventListener("click", () => {
  if (tryCart.size === 0) return;
  let total = 0;
  tryCart.forEach((l) => (total += l.item.price * l.qty));
  tryApprove.disabled = true;
  tryApprove.classList.add("approved");
  tryApprove.textContent = "Approved " + money(total);
  bubble(tryThread, "agent", "Approved. PayPal captures " + money(total) + " once the store's order is live.");
});
