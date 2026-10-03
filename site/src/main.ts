import "./style.css"

const root = document.getElementById("app")!

const SNIPPET = `<script src="https://cdn.macham.io/macham.js" data-key="mch_live_..." defer><\/script>
<script>
  Macham.init({
    store: myStore,
    brain: myBrain,
    tenantId: "my-store",
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
<div class="wrap">
  <header class="hero rise">
    <h1>Every store gets an assistant.<br />Every shopper gets answers.</h1>
    <p class="sub">One snippet. Your catalog answers questions, proposes carts, and settles through PayPal. Works with any store.</p>
    <div class="cta-row">
      <a class="btn" href="#build">Start building</a>
      <a class="btn ghost" href="#demo">Watch 60-second demo</a>
    </div>
  </header>

  <section class="block rise" id="proof">
    <p class="eyebrow">Live, not slides</p>
    <h2 class="sec">The demo below runs on a real catalog.</h2>
    <p style="color:var(--ink-2);font-size:15px">No mock data. Search, proposals, and the ledger all execute in your browser right now.</p>
  </section>

  <section class="block rise">
    <p class="eyebrow">Problem</p>
    <h2 class="sec">Support drowns. Shoppers leave.</h2>
    <ul class="clean">
      <li class="tick">Shoppers wait 6 hours for replies. They leave in 40 seconds.</li>
      <li class="tick">Support pastes tracking links all day.</li>
      <li class="tick">Developers style a widget for a week before it answers one question.</li>
    </ul>
  </section>

  <section class="block rise" id="demo">
    <p class="eyebrow">Demo</p>
    <h2 class="sec">Thirty seconds, no login.</h2>
    <div class="panel">
      <h3>Buyer asks → assistant answers → proposal waits → human approves</h3>
      <p>Numbers come from the live catalog. The model never invents stock or prices. Money moves on rails, never on words.</p>
    </div>
  </section>

  <section class="block rise" id="build">
    <p class="eyebrow">Integration</p>
    <h2 class="sec">Three steps. Ten minutes.</h2>
    <pre class="code"><button id="copy">Copy</button><code>${SNIPPET.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>
  </section>

  <section class="block rise">
    <p class="eyebrow">What changes</p>
    <h2 class="sec">Counted, not claimed.</h2>
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
    <p class="eyebrow">Control</p>
    <h2 class="sec">Guardrails, not vibes.</h2>
    <div class="grid3">
      <div class="panel"><h3>Bulk tiers</h3><p>Discount is a function of quantity. Known before chat.</p></div>
      <div class="panel"><h3>Floors hold</h3><p>Below cost never sells. MAP never breaks. No approver overrides either.</p></div>
      <div class="panel"><h3>Humans approve</h3><p>Big totals route to a person. Every concession logged.</p></div>
    </div>
  </section>

  <section class="block rise" id="price">
    <p class="eyebrow">Pricing</p>
    <h2 class="sec">Free to build.</h2>
    <div class="tiers">
      <div class="tier"><h3>Build</h3><div class="amt">₦0</div><p>500 sessions a month. Full SDK.</p><a class="btn ghost" href="#build">Start free</a></div>
      <div class="tier hot"><h3>Grow</h3><div class="amt">₦2,000</div><p>20,000 sessions. Priority rails.</p><a class="btn" href="#build" style="background:#fff;color:#0A0A0A">Grow</a></div>
      <div class="tier"><h3>Scale</h3><div class="amt">Talk</div><p>Unbounded. Dedicated lanes.</p><a class="btn ghost" href="#build">Contact</a></div>
    </div>
  </section>

  <footer>
    <div class="wrap" style="padding:0">
      Macham · Docs · Status · <a href="#build">Get API key</a>
    </div>
  </footer>
</div>`;

// Rise-on-scroll, CSS only. One observer, disconnects when done.
const seen = new WeakSet<Element>();
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !seen.has(e.target)) {
        seen.add(e.target);
        e.target.classList.add("in");
      }
    }
    if (document.querySelectorAll(".rise:not(.in)").length === 0) io.disconnect();
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".rise").forEach((el) => io.observe(el));

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
