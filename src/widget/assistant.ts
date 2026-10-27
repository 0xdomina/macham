import { Harness } from "../safety/harness.js"
import type { StoreAdapter } from "../adapters/types.js"
import type { Product } from "../types.js"
import type { AIProvider } from "../providers/types.js"
import { resolveIdentity, toneRule, type AssistantIdentity } from "../assistant/identity.js"
import { chatTurn, type ChatTurn } from "../buyer/chat.js"
import { estimateLabel, estimateNote, loadRates, type FxDisplay, type FxRates } from "../buyer/fx.js"
import {
  SEARCH_CAPABILITY,
  COMPARE_CAPABILITY,
  CART_PROPOSAL_CAPABILITY,
  priceLabel,
  searchContract,
  cartProposalContract,
} from "../buyer/shop.js"

import { isKeyShape } from "../auth/key-shape.js"
import { MachamCloudProvider } from "../providers/cloud.js"
import { LocalBrain } from "../providers/local.js"

// Embeddable buyer assistant. One mount call renders the bottom-right
// bubble, panel, and composer; chatTurn does the thinking. Styling is
// self-contained and monochrome; the host page cannot break it and it
// cannot leak into the host.
//
// Merchants hold only their Macham API key. The brain resolves server-side
// through the assist endpoint. `brain` is an internal override for tests
// and offline development only, never documented for merchants.

export type AssistantOptions = {
  store: StoreAdapter
  // Only the cloud brain needs these. Without them the widget still reads the
  // store page and answers from it, so a shopper with no merchant account gets
  // the assistant too.
  apiKey?: string
  tenantId?: string
  assistUrl?: string
  brain?: AIProvider
  identity?: Partial<AssistantIdentity>
  onProposal?: (proposal: { action: string; productId?: string; title?: string; qty?: number }) => void
  welcome?: string
  /**
   * Optional currency estimate for stores that price in another currency. The
   * host supplies the rate; without one no estimate is shown.
   */
  fx?: FxDisplay
}

export function assistantCss(): string {
  // One token block owns every translucent surface, so the two fallbacks below
  // can make the widget opaque in one place: no backdrop-filter, and a shopper
  // who asked their OS for reduced transparency.
  const opaque =
    ".mcm-launcher,.mcm-panel{--mcm-surf:#fff;--mcm-surf-2:#F5F5F5;--mcm-surf-3:#fff;--mcm-field:#fff;--mcm-line:#E5E5E5;--mcm-edge:#E5E5E5;--mcm-blur:none;--mcm-sh:0 18px 44px rgb(10 10 10 / .18)}"
  return [
    ".mcm-launcher,.mcm-panel,.mcm-panel *{box-sizing:border-box}",
    ".mcm-launcher,.mcm-panel{--mcm-ink:#0A0A0A;--mcm-muted:#6B6B6B;--mcm-line:rgb(10 10 10 / .10);--mcm-edge:rgb(255 255 255 / .62);--mcm-surf:rgb(255 255 255 / .70);--mcm-surf-2:rgb(255 255 255 / .48);--mcm-surf-3:rgb(255 255 255 / .86);--mcm-field:rgb(255 255 255 / .78);--mcm-blur:blur(20px) saturate(165%);--mcm-sh:0 26px 60px -14px rgb(10 10 10 / .30),0 2px 8px rgb(10 10 10 / .10)}",
    `@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){${opaque}}`,
    `@media (prefers-reduced-transparency:reduce){${opaque}}`,
    // The launcher is the dock handle as well as the button: a shopper can drag
    // it to any edge, and the panel follows it there next time.
    ".mcm-launcher{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:60px;height:60px;padding:0;border-radius:50%;border:1px solid rgb(255 255 255 / .22);background:rgb(10 10 10 / .90);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);color:#fff;font-size:22px;font-weight:700;cursor:grab;z-index:2147483000;box-shadow:0 14px 34px -10px rgb(0 0 0 / .45),inset 0 1px 0 rgb(255 255 255 / .18);touch-action:none;-webkit-user-select:none;user-select:none;transition:left .22s cubic-bezier(.2,.7,.3,1),top .22s cubic-bezier(.2,.7,.3,1)}",
    ".mcm-launcher:hover{filter:brightness(1.25)}",
    ".mcm-launcher:focus-visible,.mcm-panel button:focus-visible,.mcm-panel input:focus-visible{outline:2px solid rgb(10 10 10 / .55);outline-offset:2px}",
    ".mcm-host.mcm-drag .mcm-launcher,.mcm-host.mcm-drag .mcm-panel{transition:none}",
    ".mcm-host.mcm-drag .mcm-launcher{cursor:grabbing}",
    ".mcm-panel{position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom));width:min(400px,calc(100vw - 32px));height:min(620px,calc(100dvh - 120px));background:var(--mcm-surf);color:var(--mcm-ink);-webkit-backdrop-filter:var(--mcm-blur);backdrop-filter:var(--mcm-blur);border:1px solid var(--mcm-edge);border-radius:18px;z-index:2147483000;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--mcm-sh);transition:left .22s cubic-bezier(.2,.7,.3,1),top .22s cubic-bezier(.2,.7,.3,1)}",
    // The panel is toggled with the `hidden` attribute (assistant.ts:111,233).
    // Without this rule the author-level `display:flex` above beats the UA
    // `[hidden]{display:none}`, so the panel rendered open on every mount.
    ".mcm-panel[hidden]{display:none}",
    ".mcm-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--mcm-line);background:var(--mcm-surf-3);font-size:14px;font-weight:600;touch-action:none;-webkit-user-select:none;user-select:none}",
    ".mcm-id{min-width:0}",
    ".mcm-head small{display:block;font-weight:400;color:var(--mcm-muted);font-size:11px}",
    ".mcm-grip{width:24px;height:30px;flex:none;padding:0;border:0;border-radius:8px;background:transparent;color:var(--mcm-muted);cursor:grab;display:grid;place-items:center;touch-action:none}",
    ".mcm-grip:hover{background:var(--mcm-surf-2);color:var(--mcm-ink)}",
    ".mcm-grip i{display:block;width:12px;height:2px;border-radius:2px;background:currentColor;box-shadow:0 -5px 0 currentColor,0 5px 0 currentColor}",
    ".mcm-thread{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin}",
    ".mcm-msg{max-width:85%;padding:9px 13px;border-radius:15px;font-size:13.5px;line-height:1.45;overflow-wrap:anywhere}",
    ".mcm-user{align-self:flex-end;background:rgb(10 10 10 / .92);color:#fff;border:1px solid rgb(255 255 255 / .10)}",
    ".mcm-bot{align-self:flex-start;background:var(--mcm-surf-3);border:1px solid var(--mcm-line);box-shadow:0 1px 2px rgb(10 10 10 / .06)}",
    ".mcm-approve{margin-top:8px;display:flex;gap:8px}",
    ".mcm-approve button{flex:1;border-radius:999px;border:1px solid var(--mcm-line);background:var(--mcm-surf-3);padding:8px;font-size:13px;font-weight:600;cursor:pointer}",
    ".mcm-approve button.yes{background:rgb(10 10 10 / .92);color:#fff;border-color:rgb(10 10 10 / .92)}",
    ".mcm-grid{display:flex;flex-direction:column;gap:8px;margin:6px 0 2px}",
    ".mcm-card{display:flex;gap:10px;align-items:center;background:var(--mcm-surf-3);border:1px solid var(--mcm-line);border-radius:14px;padding:8px;box-shadow:0 1px 2px rgb(10 10 10 / .06)}",
    ".mcm-card .thumb{width:52px;height:52px;flex:none;border-radius:10px;object-fit:cover;background:var(--mcm-surf-2);border:1px solid var(--mcm-line)}",
    ".mcm-card .thumb.ph{display:grid;place-items:center;color:var(--mcm-muted);font-size:20px;font-weight:700}",
    ".mcm-card .who{flex:1;min-width:0}",
    ".mcm-card .title{font-size:13px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".mcm-card .price{font-size:12.5px;color:var(--mcm-muted);margin-top:2px}",
    ".mcm-card .fx{font-size:11.5px;color:var(--mcm-muted);margin-top:1px;font-variant-numeric:tabular-nums}",
    ".mcm-card .acts{display:flex;flex-direction:column;gap:6px;flex:none}",
    ".mcm-card button{border:1px solid rgb(10 10 10 / .92);background:rgb(10 10 10 / .92);color:#fff;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}",
    ".mcm-card a{font-size:11.5px;color:var(--mcm-muted);text-decoration:underline;text-align:center}",
    ".mcm-bar{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--mcm-line);background:var(--mcm-surf-3)}",
    ".mcm-bar input{flex:1;min-width:0;font-size:14px;border:1px solid var(--mcm-line);border-radius:12px;padding:10px 12px;background:var(--mcm-field);color:var(--mcm-ink)}",
    ".mcm-bar button{border-radius:12px;border:1px solid transparent;background:rgb(10 10 10 / .92);color:#fff;padding:0 16px;font-size:14px;font-weight:600;cursor:pointer}",
    "@media (max-width:480px){.mcm-panel{width:calc(100vw - 24px)}}",
    "@media (prefers-reduced-motion:reduce){.mcm-panel,.mcm-launcher{transition:none!important}}",
  ].join("\n")
}

export function initialOf(name: string): string {
  const clean = (name ?? "").trim()
  return clean ? clean.slice(0, 1).toUpperCase() : "M"
}

function ensureCss(doc: Document): void {
  if (doc.getElementById("mcm-css")) return
  const style = doc.createElement("style")
  style.id = "mcm-css"
  style.textContent = assistantCss()
  doc.head.appendChild(style)
}

export function mountAssistant(target: HTMLElement, opts: AssistantOptions): () => void {
  const doc = target.ownerDocument ?? document
  ensureCss(doc)
  if (!opts.store) throw new Error("A store adapter is needed.")
  const identity = resolveIdentity(opts.identity)
  // The assist endpoint is never the page we are standing on. Defaulting it to
  // the store's own origin would post the shopper's key to whatever site they
  // happen to be browsing, so an endpoint has to be named; without one the
  // widget answers from the store page and sends nothing anywhere.
  const assistUrl = (opts.assistUrl ?? "").trim().replace(/\/$/, "")
  const cloud = isKeyShape(opts.apiKey ?? "") && !!assistUrl && !!opts.tenantId?.trim()
  const brain = opts.brain ?? (cloud ? new MachamCloudProvider(opts.apiKey ?? "", assistUrl) : new LocalBrain())
  const harness = new Harness({
    tenantId: cloud ? (opts.tenantId ?? "") : "store-local",
    brain,
    capabilities: [
      { key: "buyer_search", effects: "none", contract: searchContract },
      { key: "buyer_compare", effects: "none", contract: searchContract },
      { key: "buyer_cart_proposal", effects: "none", contract: cartProposalContract },
    ],
  })

  const history: ChatTurn[] = []
  let open = false

  const host = doc.createElement("div")
  host.className = "mcm-host"
  host.innerHTML =
    `<button class="mcm-launcher" aria-label="Open chat" title="Drag to move \u00b7 click to open">${escapeHtml(initialOf(identity.name))}</button>` +
    `<div class="mcm-panel" hidden>` +
    `<div class="mcm-head"><button class="mcm-grip" aria-label="Drag to move" title="Drag to move"><i></i></button><span class="mcm-id">${escapeHtml(identity.name)}<small>${escapeHtml(identity.disclosure ?? "AI assistant")}</small></span></div>` +
    `<div class="mcm-thread" aria-live="polite"></div>` +
    `<div class="mcm-bar"><input type="text" placeholder="Ask about products" aria-label="Message" /><button>Send</button></div>` +
    `</div>`
  target.appendChild(host)

  const launcher = host.querySelector(".mcm-launcher") as HTMLButtonElement
  const panel = host.querySelector(".mcm-panel") as HTMLDivElement
  const grip = host.querySelector(".mcm-grip") as HTMLButtonElement
  const head = host.querySelector(".mcm-head") as HTMLDivElement
  const thread = host.querySelector(".mcm-thread") as HTMLDivElement
  const input = host.querySelector(".mcm-bar input") as HTMLInputElement
  const sendBtn = host.querySelector(".mcm-bar button") as HTMLButtonElement

  // ---- the dock ----------------------------------------------------------
  // The bubble is a guest on a store page that already has a chat widget, a
  // cookie bar and a size guide; a fixed corner is a collision. So the launcher
  // is a handle: drag it anywhere, it snaps to the nearer edge and is remembered
  // per store. The panel opens on whichever side of the bubble has room.
  const win = doc.defaultView ?? window
  const EDGE = 16
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
  const viewport = () => ({ w: win.innerWidth || 360, h: win.innerHeight || 640 })
  let storeName = "store"
  try { storeName = win.location?.host || "store" } catch { storeName = "store" }
  const dockKey = `macham_dock:${storeName}`
  const readDock = () => {
    let d: { x?: unknown; y?: unknown } | null = null
    try { d = JSON.parse(win.localStorage.getItem(dockKey) || "null") } catch { d = null }
    const v = viewport()
    const lw = launcher.offsetWidth || 60
    const lh = launcher.offsetHeight || 60
    const x = d && typeof d.x === "number" ? d.x : v.w - lw - 16
    const y = d && typeof d.y === "number" ? d.y : v.h - lh - 16
    return { x: clamp(x, EDGE, Math.max(EDGE, v.w - lw - EDGE)), y: clamp(y, EDGE, Math.max(EDGE, v.h - lh - EDGE)) }
  }
  let dock = readDock()

  const place = (save = false): void => {
    const v = viewport()
    const lw = launcher.offsetWidth || 60
    const lh = launcher.offsetHeight || 60
    dock = {
      x: clamp(dock.x, EDGE, Math.max(EDGE, v.w - lw - EDGE)),
      y: clamp(dock.y, EDGE, Math.max(EDGE, v.h - lh - EDGE)),
    }
    launcher.style.left = `${dock.x}px`
    launcher.style.top = `${dock.y}px`
    launcher.style.right = "auto"
    launcher.style.bottom = "auto"
    if (panel.hidden) {
      if (save) remember()
      return
    }
    const above = dock.y - EDGE
    const below = v.h - (dock.y + lh) - EDGE
    const down = below >= above
    // Cap the panel at the room on the open side, so it never runs off screen.
    const height = Math.max(220, Math.min(620, down ? below : above))
    panel.style.height = `${height}px`
    const pw = panel.offsetWidth || Math.min(400, v.w - 32)
    const left = dock.x + lw / 2 < v.w / 2
    panel.style.left = `${clamp(left ? dock.x : dock.x + lw - pw, EDGE, Math.max(EDGE, v.w - pw - EDGE))}px`
    panel.style.top = `${down ? dock.y + lh + 12 : dock.y - 12 - height}px`
    panel.style.right = "auto"
    panel.style.bottom = "auto"
    if (save) remember()
  }
  const remember = (): void => {
    try { win.localStorage.setItem(dockKey, JSON.stringify({ x: Math.round(dock.x), y: Math.round(dock.y) })) } catch { /* private mode: the dock works, it just resets */ }
  }

  let drag: { id: number; sx: number; sy: number; ox: number; oy: number; node: HTMLElement } | null = null
  let dragged = false
  const onMove = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.sx
    const dy = e.clientY - drag.sy
    if (!dragged) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      dragged = true
      host.classList.add("mcm-drag")
    }
    const v = viewport()
    dock = {
      x: clamp(drag.ox + dx, EDGE, Math.max(EDGE, v.w - (launcher.offsetWidth || 60) - EDGE)),
      y: clamp(drag.oy + dy, EDGE, Math.max(EDGE, v.h - (launcher.offsetHeight || 60) - EDGE)),
    }
    place()
  }
  const onUp = (e: PointerEvent): void => {
    if (!drag) return
    const node = drag.node
    drag = null
    node.removeEventListener("pointermove", onMove)
    node.removeEventListener("pointerup", onUp)
    node.removeEventListener("pointercancel", onUp)
    try { node.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (!dragged) return
    host.classList.remove("mcm-drag")
    const v = viewport()
    const lw = launcher.offsetWidth || 60
    dock.x = dock.x + lw / 2 < v.w / 2 ? EDGE : Math.max(EDGE, v.w - lw - EDGE)
    place(true)
    // The click that ends a drag must not also toggle the panel.
    setTimeout(() => { dragged = false }, 0)
  }
  const startDrag = (e: PointerEvent, node: HTMLElement): void => {
    if (e.button != null && e.button !== 0) return
    if (!node.setPointerCapture) return
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: dock.x, oy: dock.y, node }
    dragged = false
    try { node.setPointerCapture(e.pointerId) } catch { drag = null; return }
    node.addEventListener("pointermove", onMove)
    node.addEventListener("pointerup", onUp)
    node.addEventListener("pointercancel", onUp)
  }
  launcher.addEventListener("pointerdown", (e) => startDrag(e, launcher))
  head.addEventListener("pointerdown", (e) => {
    const btn = (e.target as Element | null)?.closest?.("button")
    if (btn && btn !== grip) return // Close stays a button, not a handle
    startDrag(e, (btn as HTMLElement) ?? head)
  })
  launcher.addEventListener("keydown", (e) => {
    const k = e.key
    if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "ArrowUp" && k !== "ArrowDown") return
    e.preventDefault()
    const step = e.shiftKey ? 64 : 16
    const v = viewport()
    const lw = launcher.offsetWidth || 60
    const lh = launcher.offsetHeight || 60
    dock = {
      x: clamp(dock.x + (k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0), EDGE, Math.max(EDGE, v.w - lw - EDGE)),
      y: clamp(dock.y + (k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0), EDGE, Math.max(EDGE, v.h - lh - EDGE)),
    }
    place(true)
  })
  const onResize = (): void => place()
  win.addEventListener("resize", onResize)
  place()

  const paint = (
    role: "user" | "bot",
    text: string,
    proposal?: { action: string; title?: string },
    products?: Product[],
    rates?: FxRates
  ): void => {
    const div = doc.createElement("div")
    div.className = `mcm-msg mcm-${role}`
    div.textContent = text
    thread.appendChild(div)
    if (role === "bot" && proposal && (proposal.action === "add" || proposal.action === "remove")) {
      const row = doc.createElement("div")
      row.className = "mcm-approve"
      const yes = doc.createElement("button")
      yes.className = "yes"
      yes.textContent = proposal.action === "add" ? "Add to bag" : "Remove"
      yes.onclick = () => {
        opts.onProposal?.(proposal)
        row.remove()
        const note = doc.createElement("div")
        note.className = "mcm-msg mcm-bot"
        note.textContent = "Done."
        thread.appendChild(note)
        thread.scrollTop = thread.scrollHeight
      }
      const no = doc.createElement("button")
      no.textContent = "Keep looking"
      no.onclick = () => row.remove()
      row.appendChild(yes)
      row.appendChild(no)
      thread.appendChild(row)
    }
    if (role === "bot" && products && products.length) {
      const grid = doc.createElement("div")
      grid.className = "mcm-grid"
      for (const p of products) {
        const card = doc.createElement("div")
        card.className = "mcm-card"
        if (p.imageUrl && /^https?:\/\//i.test(p.imageUrl)) {
          const img = doc.createElement("img")
          img.className = "thumb"
          img.alt = ""
          img.loading = "lazy"
          img.referrerPolicy = "no-referrer"
          img.src = p.imageUrl
          card.appendChild(img)
        } else {
          const ph = doc.createElement("div")
          ph.className = "thumb ph"
          ph.textContent = initialOf(p.title)
          card.appendChild(ph)
        }
        const who = doc.createElement("div")
        who.className = "who"
        const t = doc.createElement("div")
        t.className = "title"
        t.textContent = p.title
        who.appendChild(t)
        const pr = doc.createElement("div")
        pr.className = "price"
        pr.textContent = priceLabel(p)
        who.appendChild(pr)
        const est = rates ? estimateLabel(p, opts.fx, rates) : null
        if (est) {
          const fxLine = doc.createElement("div")
          fxLine.className = "fx"
          fxLine.textContent = est
          fxLine.title = estimateNote(p, opts.fx)
          who.appendChild(fxLine)
        }
        card.appendChild(who)
        const acts = doc.createElement("div")
        acts.className = "acts"
        const add = doc.createElement("button")
        add.textContent = "Add"
        add.onclick = () => void send(`add ${p.title} to my bag`)
        acts.appendChild(add)
        const metaUrl = p.metadata && typeof p.metadata.url === "string" ? p.metadata.url : null
        if (metaUrl && /^https?:\/\//i.test(metaUrl)) {
          const a = doc.createElement("a")
          a.href = metaUrl
          a.target = "_blank"
          a.rel = "noreferrer"
          a.textContent = "See at store"
          acts.appendChild(a)
        }
        card.appendChild(acts)
        grid.appendChild(card)
      }
      thread.appendChild(grid)
    }
    thread.scrollTop = thread.scrollHeight
  }

  let busy = false
  const send = async (text: string) => {
    const clean = text.trim()
    if (!clean || busy) return
    busy = true
    try {
      paint("user", clean)
      input.value = ""
      const { reply, history: next } = await chatTurn(harness, opts.store, history, clean)
      history.length = 0
      history.push(...next)
      // One rate lookup per currency in the result, before the cards paint, so a
      // card never appears and then changes its second price.
      const rates = reply.products?.length ? await loadRates(reply.products, opts.fx) : undefined
      paint("bot", reply.text, reply.proposal, reply.products, rates)
    } catch (e) {
      // A bare "something failed" leaves the shopper with nothing to act on and
      // the developer with nothing to grep. Name the reason.
      const reason = e instanceof Error ? e.message : String(e)
      paint("bot", `That did not work: ${(reason || "unknown error").slice(0, 160)}`)
    } finally {
      busy = false
    }
  }

  // Tone lives in identity config and model prompts; the welcome line
  // carries the name. No dead calls.
  const toggle = () => {
    if (dragged) return
    open = !open
    panel.hidden = !open
    place()
    if (open && thread.childElementCount === 0) {
      paint("bot", `Hi, I'm ${identity.name}. Tell me what you need.`)
    }
    if (open) input.focus()
  }
  launcher.onclick = toggle
  sendBtn.onclick = () => void send(input.value)
  input.onkeydown = (e) => {
    if (e.key === "Enter") void send(input.value)
  }

  return () => {
    win.removeEventListener("resize", onResize)
    host.remove()
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
