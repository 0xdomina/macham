// Deterministic virtual time for the film. Installed in every frame before any
// page script runs, so the untouched product code becomes a pure function of the
// film clock: no wall clock, no network, no unseeded randomness.
(() => {
  let epoch = 1792671735443;
  try {
    if (window.top && window.top.__EPOCH) epoch = Number(window.top.__EPOCH);
  } catch {}
  const V = { t: 0, epoch, timers: [], next: 1, seed: 0x4d414348 };
  window.__V = V;

  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  window.__realSetTimeout = (fn, ms) => realSetTimeout(fn, ms);
  window.__realClearTimeout = (id) => realClearTimeout(id);

  const push = (t) => V.timers.push(t);
  window.setTimeout = (fn, ms, ...args) => {
    const id = V.next++;
    push({ id, at: V.t + (Number(ms) || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms, ...args) => {
    const id = V.next++;
    push({ id, at: V.t + (Number(ms) || 0), every: Number(ms) || 0, fn, args });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    const i = V.timers.findIndex((x) => x.id === id);
    if (i >= 0) V.timers.splice(i, 1);
  };

  const RealDate = Date;
  window.Date = class Date extends RealDate {
    constructor(...args) {
      super(args.length ? args[0] : V.epoch + Math.round(V.t));
    }
    static now() {
      return V.epoch + Math.round(V.t);
    }
  };

  window.Math.random = () => {
    V.seed = (V.seed * 1664525 + 1013904223) >>> 0;
    return V.seed / 4294967296;
  };

  // Consume the recorded gateway transcript in call order. Any unrecorded route
  // returns a failing response instead of hanging, so a script mistake shows up
  // as an error state on screen rather than a silently blank frame.
  const seq = (() => {
    try {
      return (window.top && window.top.__SEQ) || [];
    } catch {
      return [];
    }
  })();
  let cursor = 0;
  V.log = [];
  window.__seqCursor = () => cursor;
  window.__seqLog = () => V.log.slice();
  window.__resetSeq = () => {
    cursor = 0;
    V.seed = 0x4d414348;
    V.t = 0;
    V.log = [];
  };

  // Stable stringify so a body comparison does not depend on key order.
  const canon = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canon(value[k])).join(",") + "}";
  };

  const pathnameOf = (raw) => {
    const s = String(raw ?? "");
    try {
      return new URL(s, location.href).pathname;
    } catch {
      return s.split("?")[0];
    }
  };

  const match = (method, path, sent) => {
    // Exact order only. If the product calls something out of sequence the frame
    // shows an error state instead of quietly replaying the wrong payload.
    const hit = seq[cursor];
    if (!hit || hit.method !== method || !hit.routes.some((r) => path.endsWith(r))) return null;
    // A frozen answer is only honest if it is the answer to THIS request. The
    // captured request body travels with the transcript; anything else fails the
    // frame loudly instead of showing a model reply the buyer never asked for.
    if (hit.expect !== undefined && canon(sent) !== canon(hit.expect)) {
      V.log.push(method + " " + path + " -> 410 body mismatch");
      return null;
    }
    cursor += 1;
    return hit;
  };

  const realFetch = window.fetch.bind(window);
  window.__realFetch = realFetch;
  window.fetch = (input, init) => {
    const method = String((init && init.method) || "GET").toUpperCase();
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    const path = pathnameOf(raw);
    let sent;
    if (init && typeof init.body === "string") {
      try {
        sent = JSON.parse(init.body);
      } catch {
        sent = init.body;
      }
    }
    // The render is offline: every route the product calls is answered from the
    // frozen transcript, and anything unrecorded fails closed.
    const hit = match(method, path, sent);
    if (!hit) {
      if (!/^\/(fixtures|build)\b/.test(path)) V.log.push(method + " " + path + " -> 410");
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Unrecorded route: " + method + " " + path }), {
          status: 410,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    V.log.push(method + " " + path + " -> ok@" + (V.t / 1000).toFixed(2) + "s");
    const resp = () => new Response(JSON.stringify(hit.body), { status: 200, headers: { "Content-Type": "application/json" } });
    // A recorded latency keeps the product's own waiting state on screen; the
    // wait runs on the film clock, so it is reproducible frame to frame.
    if (!hit.delay) return Promise.resolve(resp());
    return new Promise((res) => window.setTimeout(() => res(resp()), hit.delay));
  };

  // The camera frames the product; the page never scrolls itself. focus() has its
  // own built-in scroll-into-view that Element.prototype overrides do not catch.
  // The widget's own thread auto-scroll (thread.scrollTop = scrollHeight,
  // src/widget/assistant.ts:207) is left intact — that is product behaviour.
  try {
    Element.prototype.scrollIntoView = function () {};
    const realFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () {
      try { realFocus.call(this, { preventScroll: true }); }
      catch { realFocus.call(this); }
    };
  } catch {}
  document.addEventListener("DOMContentLoaded", () => {
    if (document.documentElement) document.documentElement.style.overflow = "hidden";
    if (document.body) document.body.style.overflow = "hidden";
  });
  window.__pinScroll = () => {
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch {}
  };

  // Advance the clock to an absolute film time, firing every due timer in order.
  window.__advanceTo = (tMs) => {
    for (;;) {
      let next = null;
      for (const x of V.timers) if (x.at <= tMs && (!next || x.at < next.at || (x.at === next.at && x.id < next.id))) next = x;
      if (!next) break;
      V.timers.splice(V.timers.indexOf(next), 1);
      V.t = next.at;
      if (next.every) push({ id: next.id, at: V.t + next.every, every: next.every, fn: next.fn, args: next.args });
      try {
        if (typeof next.fn === "function") next.fn(...(next.args || []));
        else new Function(String(next.fn))();
      } catch (e) {}
    }
    V.t = tMs;
  };
})();
