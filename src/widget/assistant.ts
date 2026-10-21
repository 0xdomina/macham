import { Harness } from "../safety/harness.js"
import type { StoreAdapter } from "../adapters/types.js"
import type { Product } from "../types.js"
import type { AIProvider } from "../providers/types.js"
import { resolveIdentity, toneRule, type AssistantIdentity } from "../assistant/identity.js"
import { chatTurn, type ChatTurn } from "../buyer/chat.js"
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
  apiKey: string
  tenantId: string
  assistUrl?: string
  brain?: AIProvider
  identity?: Partial<AssistantIdentity>
  onProposal?: (proposal: { action: string; productId?: string; title?: string; qty?: number }) => void
  welcome?: string
}

export function assistantCss(): string {
  return [
    ".mcm-launcher{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:60px;height:60px;border-radius:50%;border:1px solid #E5E5E5;background:#0A0A0A;color:#fff;font-size:22px;font-weight:700;cursor:pointer;z-index:2147483000;box-shadow:0 8px 32px rgb(0 0 0 / 0.16)}",
    ".mcm-panel{position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom));width:min(400px,calc(100vw - 32px));height:min(620px,calc(100dvh - 120px));background:#fff;border:1px solid #E5E5E5;border-radius:14px;z-index:2147483000;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgb(0 0 0 / 0.16)}",
    ".mcm-head{padding:12px 14px;border-bottom:1px solid #E5E5E5;font-size:14px;font-weight:600}",
    ".mcm-head small{display:block;font-weight:400;color:#6B6B6B;font-size:11px}",
    ".mcm-thread{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
    ".mcm-msg{max-width:85%;padding:9px 13px;border-radius:13px;font-size:13.5px;line-height:1.45}",
    ".mcm-user{align-self:flex-end;background:#0A0A0A;color:#fff}",
    ".mcm-bot{align-self:flex-start;background:#F5F5F5;border:1px solid #E5E5E5}",
    ".mcm-approve{margin-top:8px;display:flex;gap:8px}",
    ".mcm-approve button{flex:1;border-radius:999px;border:1px solid #E5E5E5;background:#fff;padding:8px;font-size:13px;font-weight:600;cursor:pointer}",
    ".mcm-approve button.yes{background:#0A0A0A;color:#fff;border-color:#0A0A0A}",
    ".mcm-grid{display:flex;flex-direction:column;gap:8px;margin:6px 0 2px}",
    ".mcm-card{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #E5E5E5;border-radius:12px;padding:8px}",
    ".mcm-card .thumb{width:52px;height:52px;flex:none;border-radius:8px;object-fit:cover;background:#F5F5F5;border:1px solid #E5E5E5}",
    ".mcm-card .thumb.ph{display:grid;place-items:center;color:#6B6B6B;font-size:20px;font-weight:700}",
    ".mcm-card .who{flex:1;min-width:0}",
    ".mcm-card .title{font-size:13px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".mcm-card .price{font-size:12.5px;color:#6B6B6B;margin-top:2px}",
    ".mcm-card .acts{display:flex;flex-direction:column;gap:6px;flex:none}",
    ".mcm-card button{border:1px solid #0A0A0A;background:#0A0A0A;color:#fff;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}",
    ".mcm-card a{font-size:11.5px;color:#6B6B6B;text-decoration:underline;text-align:center}",
    ".mcm-bar{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #E5E5E5}",
    ".mcm-bar input{flex:1;font-size:14px;border:1px solid #E5E5E5;border-radius:10px;padding:10px 12px}",
    ".mcm-bar button{border-radius:10px;border:0;background:#0A0A0A;color:#fff;padding:0 16px;font-size:14px;font-weight:600;cursor:pointer}",
    "@media (max-width:480px){.mcm-panel{right:8px;left:8px;width:auto}}",
    "@media (prefers-reduced-motion:reduce){.mcm-panel,.mcm-launcher{transition:none}}",
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
  if (!opts.store || !isKeyShape(opts.apiKey ?? "") || !opts.tenantId?.trim()) {
    throw new Error("Store, Macham API key, and tenant needed.")
  }
  const identity = resolveIdentity(opts.identity)
  const fallbackAssistUrl = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:8787"
    : typeof window !== "undefined" ? window.location.origin : "http://localhost:8787"
  const assistUrl = opts.assistUrl ?? fallbackAssistUrl
  const brain = opts.brain ?? new MachamCloudProvider(opts.apiKey, assistUrl)
  const harness = new Harness({
    tenantId: opts.tenantId,
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
  host.innerHTML =
    `<button class="mcm-launcher" aria-label="Open chat">${escapeHtml(initialOf(identity.name))}</button>` +
    `<div class="mcm-panel" hidden>` +
    `<div class="mcm-head">${escapeHtml(identity.name)}<small>${escapeHtml(identity.disclosure ?? "AI assistant")}</small></div>` +
    `<div class="mcm-thread" aria-live="polite"></div>` +
    `<div class="mcm-bar"><input type="text" placeholder="Ask about products" aria-label="Message" /><button>Send</button></div>` +
    `</div>`
  target.appendChild(host)

  const launcher = host.querySelector(".mcm-launcher") as HTMLButtonElement
  const panel = host.querySelector(".mcm-panel") as HTMLDivElement
  const thread = host.querySelector(".mcm-thread") as HTMLDivElement
  const input = host.querySelector(".mcm-bar input") as HTMLInputElement
  const sendBtn = host.querySelector(".mcm-bar button") as HTMLButtonElement

  const paint = (
    role: "user" | "bot",
    text: string,
    proposal?: { action: string; title?: string },
    products?: Product[]
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
      paint("bot", reply.text, reply.proposal, reply.products)
    } catch {
      paint("bot", "Something failed. Try again.")
    } finally {
      busy = false
    }
  }

  // Tone lives in identity config and model prompts; the welcome line
  // carries the name. No dead calls.
  const toggle = () => {
    open = !open
    panel.hidden = !open
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
    host.remove()
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
