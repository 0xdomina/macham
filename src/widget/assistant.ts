import { Harness } from "../safety/harness.js"
import type { StoreAdapter } from "../adapters/types.js"
import type { AIProvider } from "../providers/types.js"
import { resolveIdentity, toneRule, type AssistantIdentity } from "../assistant/identity.js"
import { chatTurn, type ChatTurn } from "../buyer/chat.js"
import {
  SEARCH_CAPABILITY,
  COMPARE_CAPABILITY,
  CART_PROPOSAL_CAPABILITY,
  searchContract,
  cartProposalContract,
} from "../buyer/shop.js"

// Embeddable buyer assistant. One mount call renders the bottom-right
// bubble, panel, and composer; chatTurn does the thinking. Styling is
// self-contained and monochrome; the host page cannot break it and it
// cannot leak into the host.

export type AssistantOptions = {
  store: StoreAdapter
  brain: AIProvider
  tenantId: string
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
  const identity = resolveIdentity(opts.identity)
  const harness = new Harness({
    tenantId: opts.tenantId,
    brain: opts.brain,
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

  const paint = (role: "user" | "bot", text: string, proposal?: { action: string; title?: string }): void => {
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
      paint("bot", reply.text, reply.proposal)
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
