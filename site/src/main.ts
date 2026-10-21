import "./style.css"

const root = document.getElementById("app")!

const SNIPPET = `<script src="https://YOUR-MACHAM-HOST/macham.js" data-key="mch_live_..." defer><\/script>
<script>
  Macham.init({
    apiKey: "mch_live_...",
    tenantId: "my-store",
    assistUrl: "https://YOUR-MACHAM-HOST",
    identity: { name: "Ada" },
  })
<\/script>`;

root.innerHTML = `
<nav class="top"><div class="wrap">
  <a class="logo" href="#">Macham</a>
  <a href="#build">Docs</a>
  <a href="#price">Pricing</a>
  <a href="https://github.com">GitHub</a>
</div></nav>
<canvas id="gridfx" aria-hidden="true"></canvas>
<canvas id="bgfx" aria-hidden="true"></canvas>
<div class="scanline" aria-hidden="true"></div>
<div class="wrap">
  <header class="hero rise">
    <p class="status"><span class="dot" aria-hidden="true"></span><span class="dec" data-text="System online. Catalog linked. PayPal ready.">System online. Catalog linked. PayPal ready.</span><span class="cursor" aria-hidden="true"></span></p>
    <h1><span class="dec" data-text="Every store gets an assistant.">Every store gets an assistant.</span><br /><span class="dec" data-text="Every shopper gets answers.">Every shopper gets answers.</span></h1>
    <p class="sub">One snippet. Your catalog answers questions, proposes carts, and can settle through PayPal Orders v2. Works with any store.</p>
    <div class="cta-row">
      <a class="btn" href="#build">Start building</a>
      <a class="btn ghost" href="#demo">Watch 60-second demo</a>
    </div>
  </header>

  <section class="block rise" id="proof">
    <h2 class="sec dec" data-text="Watch it work.">Watch it work.</h2>
    <p style="color:var(--ink-2);font-size:15px">Search. Compare. Approve. Settled.</p>
  </section>

  <section class="block rise">
    <p class="eyebrow dec" data-text="Problem">Problem</p>
    <h2 class="sec dec" data-text="Support drowns. Shoppers leave.">Support drowns. Shoppers leave.</h2>
    <ul class="clean">
      <li class="tick">Shoppers wait 6 hours for replies. They leave in 40 seconds.</li>
      <li class="tick">Support pastes tracking links all day.</li>
      <li class="tick">Developers style a widget for a week before it answers one question.</li>
    </ul>
  </section>

  <section class="block rise" id="demo">
    <h2 class="sec dec" data-text="Thirty seconds, no login.">Thirty seconds, no login.</h2>
    <div class="stage">
      <div class="phone" role="img" aria-label="Phone showing a marketplace with a Macham helper button. The shopper taps it, a small assistant sheet opens over the store, compares three offers, and the shopper approves a PayPal purchase.">
        <div class="notch" aria-hidden="true"></div>
        <div class="statusbar" aria-hidden="true"><span>9:41</span><span class="sig">··· ▮</span></div>
        <div class="screen" id="screen" aria-hidden="true"></div>
        <div class="homebar" aria-hidden="true"></div>
      </div>
      <div class="controls">
        <div class="dots" id="dots" role="tablist" aria-label="Replay steps"></div>
        <button class="btn ghost" id="replay" type="button">Replay</button>
      </div>
    </div>
  </section>

  <section class="block rise" id="build">
    <p class="eyebrow dec" data-text="Integration">Integration</p>
    <h2 class="sec dec" data-text="Three steps. Ten minutes.">Three steps. Ten minutes.</h2>
    <pre class="code"><button id="copy">Copy</button><code>${SNIPPET.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>
  </section>

  <section class="block rise">
    <p class="eyebrow dec" data-text="What changes">What changes</p>
    <h2 class="sec dec" data-text="Counted, not claimed.">Counted, not claimed.</h2>
    <table class="duo">
      <tr><th>Without</th><th>With</th></tr>
      <tr><td>14 messages per order</td><td>3</td></tr>
      <tr><td>Replies in 6 hours</td><td>Answers in 4 seconds</td></tr>
      <tr><td>Missed carts stay missed</td><td>One nudge at 30 seconds</td></tr>
      <tr><td>Every store looks like us</td><td>Your colors. Your name. Your tone.</td></tr>
      <tr><td>Redirect maze at checkout</td><td>Approve in chat. PayPal settles.</td></tr>
    </table>
  </section>

  <section class="block rise">
    <p class="eyebrow dec" data-text="Control">Control</p>
    <h2 class="sec dec" data-text="Guardrails, not vibes.">Guardrails, not vibes.</h2>
    <div class="grid3">
      <div class="panel"><h3>Data-only answers</h3><p>Prices come from the live read. Never invented, never guessed.</p></div>
      <div class="panel"><h3>Propose, never mutate</h3><p>The cart is a proposal. A human approves before anything is ordered.</p></div>
      <div class="panel"><h3>Locked total</h3><p>The approved total is what PayPal captures, within tolerance. Fixed price, no haggling.</p></div>
    </div>
  </section>

  <section class="block rise" id="price">
    <p class="eyebrow dec" data-text="Pricing">Pricing</p>
    <h2 class="sec dec" data-text="Free.">Free.</h2>
    <div class="tiers">
      <div class="tier hot"><h3>Every store</h3><div class="amt">$0</div><p>Search. Compare. Proposals. Approvals. Settlement.</p><a class="btn" href="#build" style="background:#fff;color:#0A0A0A">Start free</a></div>
    </div>
  </section>

  <footer>
    <div class="wrap" style="padding:0">
      Macham · Docs · Status · <a href="#build">Get API key</a>
    </div>
  </footer>
</div>`;

// Rise-on-scroll. Section heads decrypt the first time they enter view.
const seen = new WeakSet<Element>();
const GLYPHS = "01<>[]{}#$%&@*+=/\\|";
const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function decryptIn(el: HTMLElement, duration = 1100): void {
  const final = el.dataset.text ?? el.textContent ?? "";
  if (reducedMotion) {
    el.textContent = final;
    return;
  }
  const total = final.length;
  const started = performance.now();
  const frame = (t: number) => {
    const p = Math.min(1, (t - started) / duration);
    const resolved = Math.floor(p * total);
    let out = final.slice(0, resolved);
    for (let i = resolved; i < total; i++) {
      const ch = final[i];
      out += ch === " " || ch === "." || ch === "," ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = final;
  };
  requestAnimationFrame(frame);
}

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !seen.has(e.target)) {
        seen.add(e.target);
        e.target.classList.add("in");
        e.target.querySelectorAll(".dec").forEach((d, i) => {
          window.setTimeout(() => decryptIn(d as HTMLElement, d instanceof HTMLHeadingElement || d.classList.contains("sec") ? 900 : 700), i * 120);
        });
      }
    }
    if (document.querySelectorAll(".rise:not(.in)").length === 0) io.disconnect();
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".rise").forEach((el) => io.observe(el));

// Hero decrypts immediately. Copy stays identical for screen readers.
document.querySelectorAll("header.hero .dec").forEach((el, i) => {
  window.setTimeout(() => decryptIn(el as HTMLElement, 1100), 150 + i * 250);
});

// Phone replay: a shopper browses a marketplace, taps the Macham helper,
// and a small sheet opens OVER the store. The store stays visible behind
// every step. Runs only while visible. Dots jump between scenes. Still
// under reduced motion: final frame renders at once, dots step manually.
(function phone() {
  const screen = document.getElementById("screen");
  const dotsBox = document.getElementById("dots");
  if (!screen || !dotsBox) return;
  const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
  let runId = 0;
  let visible = true;
  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState === "visible";
  });
  const wait = async (ms: number, run: number) => {
    if (reducedMotion) return;
    const step = 120;
    for (let t = 0; t < ms; t += step) {
      await sleep(step);
      if (run !== runId) throw new Error("reset");
      while (!visible) await sleep(400);
    }
  };
  const TILES: Array<[string, string]> = [
    ["Harbor Parka", "$42.00"],
    ["Trail Shell", "$46.50"],
    ["Field Jacket", "$49.00"],
    ["Storm Bib", "$51.00"],
  ];
  let sheet: HTMLElement | null = null;
  let avatar: HTMLElement | null = null;
  const buildStore = () => {
    screen.innerHTML = "";
    const shop = document.createElement("div");
    shop.className = "shop";
    const head = document.createElement("div");
    head.className = "shop-head";
    head.textContent = "Ada's Store";
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    for (const [name, price] of TILES) {
      const tile = document.createElement("div");
      tile.className = "tile";
      const dot = document.createElement("div");
      dot.className = "tile-img";
      const nm = document.createElement("div");
      nm.className = "tile-name";
      nm.textContent = name;
      const pr = document.createElement("div");
      pr.className = "tile-price";
      pr.textContent = price;
      tile.append(dot, nm, pr);
      grid.appendChild(tile);
    }
    avatar = document.createElement("button");
    avatar.type = "button";
    avatar.tabIndex = -1;
    avatar.className = "avatar";
    avatar.textContent = "M";
    shop.append(head, grid, avatar);
    screen.appendChild(shop);
    sheet = document.createElement("div");
    sheet.className = "sheet";
    screen.appendChild(sheet);
  };
  const bubble = (who: "user" | "bot", text: string): HTMLElement => {
    const d = document.createElement("div");
    d.className = `sh-msg sh-${who}`;
    d.textContent = text;
    sheet!.appendChild(d);
    return d;
  };
  const typeInto = async (el: HTMLElement, text: string, run: number) => {
    if (reducedMotion) {
      el.textContent = text;
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      el.textContent = text.slice(0, i);
      await sleep(34);
      if (run !== runId) throw new Error("reset");
    }
  };
  const sayDecrypted = async (text: string, run: number) => {
    const el = bubble("bot", "");
    (el as HTMLElement).dataset.text = text;
    decryptIn(el as HTMLElement, 500);
    await wait(650, run);
  };
  const offer = (name: string, price: string) => {
    const d = document.createElement("div");
    d.className = "sh-offer";
    const n = document.createElement("strong");
    n.textContent = name;
    const p = document.createElement("span");
    p.textContent = price;
    d.append(n, p);
    sheet!.appendChild(d);
  };
  const propose = async (run: number) => {
    const p = document.createElement("div");
    p.className = "sh-proposal";
    const t = document.createElement("strong");
    t.textContent = "Trail Shell · $46.50";
    const s = document.createElement("span");
    s.textContent = "Approve in chat. PayPal settles.";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.textContent = "Approve $46.50";
    p.append(t, s, btn);
    sheet!.appendChild(p);
    await wait(1400, run);
    btn.classList.add("tap");
    await wait(600, run);
  };
  const receipt = () => {
    bubble("bot", "Paid $46.50. Receipt sent.");
    const l = document.createElement("div");
    l.className = "sh-ledger";
    l.textContent = "Ledger · $46.50 · approved";
    sheet!.appendChild(l);
  };
  const openSheet = async (run: number) => {
    sheet!.classList.add("open");
    await wait(500, run);
  };
  const tapAvatar = async (run: number) => {
    avatar!.classList.add("tap");
    await wait(500, run);
    avatar!.classList.remove("tap");
  };
  const scenes: Array<(run: number) => Promise<void>> = [
    async (run) => {
      await wait(1200, run);
    },
    async (run) => {
      await tapAvatar(run);
      await openSheet(run);
      const b = bubble("user", "");
      await typeInto(b, "warm jackets under $50", run);
    },
    async (run) => {
      await sayDecrypted("3 offers compared.", run);
      offer("Harbor Parka", "$42.00");
      await wait(400, run);
      offer("Trail Shell", "$46.50");
      await wait(400, run);
      offer("Field Jacket", "$49.00");
    },
    async (run) => {
      await propose(run);
      receipt();
    },
  ];
  const dots = scenes.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", `Scene ${i + 1}`);
    b.onclick = () => void play(i);
    dotsBox.appendChild(b);
    return b;
  });
  const paint = (i: number) => dots.forEach((d, k) => d.classList.toggle("on", k <= i));
  async function play(from = 0) {
    const run = ++runId;
    buildStore();
    try {
      // Reduced motion: dots show the story up to that scene, all at once.
      const last = reducedMotion ? Math.min(from, scenes.length - 1) : scenes.length - 1;
      const first = reducedMotion ? 0 : from;
      for (let i = first; i <= last; i++) {
        paint(i);
        await scenes[i](run);
        if (!reducedMotion) await wait(i === scenes.length - 1 ? 3400 : 900, run);
      }
      if (reducedMotion) return;
      paint(scenes.length - 1);
      await wait(600, run);
      if (run === runId) void play(0);
    } catch {
      // Reset by a newer run. Silence is correct.
    }
  }
  // Reduced motion: one still frame, dots step through it.
  if (reducedMotion) {
    void play(scenes.length - 1);
  } else {
    const view = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          view.disconnect();
          void play(0);
        }
      },
      { threshold: 0.3 }
    );
    const phone = screen.closest(".phone");
    if (phone) view.observe(phone);
  }
  document.getElementById("replay")?.addEventListener("click", () => void play(0));
})();

// Ambient decryption field: layered glyph columns with faint trails over
// a static grid. Monochrome. Pauses offscreen. Off under reduced motion.
(function background() {
  if (reducedMotion) return;
  const canvas = document.getElementById("bgfx") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth / 2);
    canvas.height = Math.floor(window.innerHeight / 2);
  };
  resize();
  window.addEventListener("resize", resize);
  const COLS = 56;
  const drops = Array.from({ length: COLS }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: 0.0006 + Math.random() * 0.0016,
    g: GLYPHS[(Math.random() * GLYPHS.length) | 0],
    tick: 0,
  }));
  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState === "visible";
    if (running) requestAnimationFrame(tick);
  });
  const tick = () => {
    if (!running) return;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "10px JetBrains Mono, monospace";
    for (const d of drops) {
      d.y += d.s;
      d.tick += 1;
      if (d.tick % 24 === 0) d.g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      if (d.y > 1) {
        d.y = -0.02;
        d.x = Math.random();
      }
      const head = d.y * canvas.height;
      ctx.fillStyle = "rgba(10,10,10,0.14)";
      ctx.fillText(d.g, d.x * canvas.width, head);
      ctx.fillStyle = "rgba(10,10,10,0.05)";
      ctx.fillText(d.g, d.x * canvas.width, head - 14);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

document.getElementById("copy")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  try {
    await navigator.clipboard.writeText(SNIPPET);
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Select manually";
  }
  window.setTimeout(() => (btn.textContent = "Copy"), 1500);
});
