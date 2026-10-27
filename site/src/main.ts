import "./style.css";

// Enable JS-only styling (entrance motion). Markup and the live fragment already
// render from index.html, so a failed script never hides content.
document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── entrance: reveal each section block once it enters view ──
const riseEls = Array.from(document.querySelectorAll<HTMLElement>(".rise"));
if (reducedMotion || !("IntersectionObserver" in window)) {
  riseEls.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  riseEls.forEach((el) => io.observe(el));
}

// ── copy the real install snippet (read as text, never re-parsed as markup) ──
const codeSource = document.getElementById("install-code");
const snippetText = codeSource ? codeSource.textContent ?? "" : "";

function wireCopy(btn: HTMLElement): void {
  const original = btn.textContent ?? "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(snippetText);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select the snippet";
    }
    window.setTimeout(() => {
      btn.textContent = original;
    }, 1600);
  });
}

document.querySelectorAll<HTMLElement>("[data-copy]").forEach(wireCopy);

// ── chat: a real text box with a local rule-based agent over a seeded catalog ──
type Item = { id: string; title: string; price: number; tags: string[] };
type Line = { item: Item; qty: number };

const CATALOG: Item[] = [
  { id: "hp-1", title: "Wireless over-ear headphones, ANC", price: 79, tags: ["headphones", "headphone", "wireless", "bluetooth", "over-ear", "anc", "noise", "cancelling", "audio"] },
  { id: "hp-2", title: "Wireless earbuds, sport fit", price: 49, tags: ["earbuds", "earbud", "wireless", "bluetooth", "sport", "audio", "headphones"] },
  { id: "hp-3", title: "Budget wired headphones", price: 19, tags: ["headphones", "headphone", "wired", "budget", "audio"] },
  { id: "hp-4", title: "Studio wireless headphones, 40h battery", price: 149, tags: ["headphones", "headphone", "wireless", "studio", "audio", "bluetooth"] },
  { id: "hp-5", title: "Gaming headset with mic", price: 59, tags: ["headset", "gaming", "mic", "headphones", "headphone", "wired", "audio"] },
  { id: "sp-1", title: "Portable bluetooth speaker", price: 39, tags: ["speaker", "bluetooth", "wireless", "portable", "audio"] },
  { id: "tee-1", title: "Tee, black", price: 25, tags: ["tee", "shirt", "black", "cotton", "clothing"] },
  { id: "cap-1", title: "Cap, olive", price: 8, tags: ["cap", "hat", "olive", "clothing"] },
];

const STOP = new Set(["a", "an", "the", "i", "want", "need", "some", "for", "with", "and", "or", "of", "to", "me", "please", "show", "find", "get", "under", "below", "less", "than", "max", "around", "about", "in", "is", "any", "under"]);

const thread = document.getElementById("thread");
const form = document.getElementById("chat-form") as HTMLFormElement | null;
const input = document.getElementById("chat-input") as HTMLInputElement | null;
const cartBox = document.getElementById("cart");
const cartLines = document.getElementById("cart-lines");
const cartTotal = document.getElementById("cart-total");
const chatModal = document.getElementById("chat");
const openers = Array.from(document.querySelectorAll<HTMLElement>("[data-open-chat]"));
const closer = document.querySelector<HTMLElement>("[data-close-chat]");

const cart = new Map<string, Line>();
let lastOffers: Item[] = [];
let greeted = false;

function money(n: number): string {
  return n.toFixed(2) + " USD";
}

function bubble(kind: "agent" | "user", text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "bub " + kind;
  el.textContent = text;
  thread?.appendChild(el);
  if (thread) thread.scrollTop = thread.scrollHeight;
  return el;
}

function offerBubble(items: Item[]): void {
  const wrap = document.createElement("div");
  wrap.className = "bub agent offers";
  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "offer";
    const label = document.createElement("span");
    label.textContent = (idx + 1) + ". " + it.title + " " + money(it.price);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn small";
    btn.textContent = "Add";
    btn.addEventListener("click", () => addToCart(it.id));
    row.appendChild(label);
    row.appendChild(btn);
    wrap.appendChild(row);
  });
  thread?.appendChild(wrap);
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function renderCart(): void {
  if (!cartLines || !cartTotal || !cartBox) return;
  cartLines.textContent = "";
  let total = 0;
  let count = 0;
  cart.forEach((line) => {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = line.item.title + " x" + line.qty;
    const amt = document.createElement("span");
    const sub = line.item.price * line.qty;
    amt.textContent = money(sub);
    row.appendChild(name);
    row.appendChild(amt);
    cartLines.appendChild(row);
    total += sub;
    count += line.qty;
  });
  cartTotal.textContent = money(total);
  cartBox.hidden = count === 0;
  const approveBtn = document.getElementById("approve") as HTMLButtonElement | null;
  const note = document.getElementById("prop-note");
  if (approveBtn) {
    approveBtn.disabled = count === 0;
    approveBtn.textContent = count === 0 ? "Approve total" : "Approve " + money(total);
  }
  if (note) note.textContent = count === 0 ? "Add something to your cart to approve." : "You approve this exact total.";
}

function addToCart(id: string, qty = 1): void {
  const item = CATALOG.find((c) => c.id === id);
  if (!item) return;
  const cur = cart.get(id);
  cart.set(id, { item, qty: (cur ? cur.qty : 0) + qty });
  renderCart();
  bubble("agent", "Added " + qty + " x " + item.title + " to your cart. Anything else, or approve the total below.");
}

function parseBudget(text: string): number | null {
  const m = text.match(/(?:under|below|less than|max|up to|<|within)\s*\$?\s*(\d+(?:\.\d+)?)/i) || text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function searchOffers(text: string): Item[] {
  const budget = parseBudget(text);
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+(\.\d+)?$/.test(w));
  const scored = CATALOG.map((it) => {
    let score = 0;
    for (const w of words) {
      if (it.tags.includes(w)) score += 3;
      else if (it.title.toLowerCase().includes(w)) score += 2;
      else if (it.tags.some((t) => t.startsWith(w) || w.startsWith(t))) score += 1;
    }
    return { it, score };
  });
  let pool = scored.filter((s) => s.score > 0);
  if (budget !== null) pool = pool.filter((s) => s.it.price <= budget);
  pool.sort((a, b) => b.score - a.score || a.it.price - b.it.price);
  return pool.slice(0, 3).map((s) => s.it);
}

function handleMessage(raw: string): void {
  const text = raw.trim();
  if (!text) return;
  bubble("user", text);
  const lower = text.toLowerCase();

  const addMatch = lower.match(/^(?:add|buy|get)\s+(?:(\d+)|the\s+(first|second|third|one|two|three))/);
  if (addMatch) {
    const idxWords: Record<string, number> = { first: 0, one: 0, second: 1, two: 1, third: 2, three: 2 };
    const pos = addMatch[2] ? idxWords[addMatch[2]] : parseInt(addMatch[1], 10) - 1;
    const pick = lastOffers[pos];
    if (pick) addToCart(pick.id);
    else bubble("agent", "Ask for something first, then tell me which one to add.");
    return;
  }
  if (lower === "clear" || lower === "empty cart") {
    cart.clear();
    renderCart();
    bubble("agent", "Cart cleared.");
    return;
  }

  const offers = searchOffers(text);
  if (offers.length === 0) {
    lastOffers = [];
    bubble("agent", "Nothing matched that in this store. Try words like headphones, earbuds, speaker, tee, or cap, and a budget like under 100.");
    return;
  }
  lastOffers = offers;
  const budget = parseBudget(text);
  bubble("agent", "Here are " + offers.length + " matches" + (budget !== null ? " under " + budget + " USD" : "") + ". Tap Add, or type add 1.");
  offerBubble(offers);
}

function greet(): void {
  if (greeted) return;
  greeted = true;
  bubble("agent", "What do you need from this store? Type it in plain words, like wireless headphones under 100.");
}

function openChat(): void {
  chatModal?.classList.add("open");
  greet();
  window.setTimeout(() => input?.focus(), 30);
}

function closeChat(): void {
  chatModal?.classList.remove("open");
}

openers.forEach((b) => b.addEventListener("click", openChat));
closer?.addEventListener("click", closeChat);
chatModal?.addEventListener("click", (e) => {
  if (e.target === chatModal) closeChat();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeChat();
});

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!input) return;
  const v = input.value;
  input.value = "";
  handleMessage(v);
});

// ── the human approves: the one interactive thing on the page ──
const approve = document.getElementById("approve");
const settled = document.getElementById("settled");
const note = document.getElementById("prop-note");

if (approve instanceof HTMLButtonElement && settled && note) {
  approve.addEventListener("click", () => {
    if (cart.size === 0) return;
    approve.disabled = true;
    let total = 0;
    cart.forEach((l) => (total += l.item.price * l.qty));
    approve.textContent = "Approved " + money(total);
    note.textContent = "Approved by you. PayPal was asked to capture the locked total.";
    settled.hidden = false;
  });
}
