import "./style.css"
import "ag-grid-community/styles/ag-grid.css"
import "ag-grid-community/styles/ag-theme-quartz.css"
import { createGrid, type GridOptions } from "ag-grid-community"
import { listProducts, priceOf } from "./api"
import { addProposal, logAction, readLedger, readProposals, settleProposal } from "./ledger"
import { listenOnce, speak, voiceSupported } from "./voice"

const root = document.getElementById("app")!

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function shell(inner: string): string {
  return `
    <header class="topbar">
      <a class="brand" href="#/">Macham demo</a>
      <a href="#/chat">Chat</a>
      <a href="#/ledger">Ledger</a>
      <a href="#/approvals">Approvals</a>
    </header>
    <main class="page">${inner}</main>`
}

function skeletons(n: number): string {
  return `<div class="grid">${Array.from({ length: n })
    .map(() => `<div class="skel"></div>`)
    .join("")}</div>`
}

async function renderMarket(): Promise<void> {
  root.innerHTML = shell(
    `<div class="hero"><h1>Live market</h1><p>Real products, real prices. Ask the chat to find things.</p></div>
    <div class="finder"><input id="q" type="search" placeholder="Search products" /></div>
    <div id="grid">${skeletons(6)}</div>`
  )
  const paint = async (q?: string) => {
    const grid = document.getElementById("grid")
    if (grid) grid.innerHTML = skeletons(6)
    try {
      const products = await listProducts(12, q || undefined)
      const g = document.getElementById("grid")
      if (!g) return
      g.innerHTML = products.length
        ? `<div class="grid">${products
            .map(
              (p) => `
          <div class="card">
            ${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" loading="lazy" />` : ""}
            <div class="card-body"><h3>${esc(p.title)}</h3><div class="price">${esc(priceOf(p) ?? "")}</div></div>
          </div>`
            )
            .join("")}</div>`
        : `<div class="notice"><strong>Nothing found.</strong> Try another word.</div>`
    } catch (e: any) {
      const g = document.getElementById("grid")
      if (g) g.innerHTML = `<div class="notice"><strong>Market is unreachable.</strong> ${esc(e?.message ?? "")}</div>`
    }
  }
  const input = document.getElementById("q") as HTMLInputElement | null
  let timer: number | undefined
  input?.addEventListener("input", () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void paint(input.value.trim() || undefined), 350)
  })
  await paint()
}

type Msg = { role: "user" | "bot"; text: string }

const thread: Msg[] = []

function paintThread(): void {
  const box = document.getElementById("thread")
  if (!box) return
  box.innerHTML = thread
    .map((m) => `<div class="bubble ${m.role}">${esc(m.text)}</div>`)
    .join("")
  box.scrollTop = box.scrollHeight
}

function answerLocally(message: string): string | null {
  // Deterministic catalog answers need no model. Model replies arrive
  // when a provider key is configured (server-side in production).
  void message
  return null
}

async function renderChat(): Promise<void> {
  root.innerHTML = shell(
    `<div class="hero"><h1>Assistant</h1><p>Ask for products. Approve nothing here moves money.</p></div>
    <div class="thread" id="thread" aria-live="polite"></div>
    <div class="composer">
      <input id="msg" type="text" placeholder="Find warm jackets" autocomplete="off" />
      <button class="iconbtn" id="mic" aria-label="Speak">🎙</button>
      <button class="btn" id="send" style="width:auto;margin-top:0">Send</button>
    </div>
    <div id="chat-err"></div>`
  )
  paintThread()
  const input = document.getElementById("msg") as HTMLInputElement
  const errBox = document.getElementById("chat-err")!

  const send = async (text: string) => {
    const clean = text.trim()
    if (!clean) return
    thread.push({ role: "user", text: clean })
    paintThread()
    input.value = ""
    try {
      const products = await listProducts(6, clean)
      if (!products.length) {
        thread.push({ role: "bot", text: "Nothing matched. Try other words." })
      } else {
        const top = products.slice(0, 3)
        thread.push({
          role: "bot",
          text: `Found ${products.length}: ${top.map((p) => `${p.title} (${priceOf(p) ?? "price on request"})`).join(", ")}.`,
        })
        const first = products[0]
        const prop = addProposal(`Buy ${first.title}`, `${priceOf(first) ?? ""} · tap Approve to record intent`)
        logAction("cart_proposed", first.title, "info")
        thread.push({
          role: "bot",
          text: `Proposal ${prop.id.slice(-4)} waiting in Approvals. Nothing moves until you approve.`,
        })
      }
    } catch (e: any) {
      thread.push({ role: "bot", text: `Search failed. ${e?.message ?? "Retry."}` })
    }
    void answerLocally(clean)
    paintThread()
  }

  document.getElementById("send")?.addEventListener("click", () => void send(input.value))
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void send(input.value)
  })
  document.getElementById("mic")?.addEventListener("click", async () => {
    if (!voiceSupported()) {
      errBox.innerHTML = `<div class="notice"><strong>Mic blocked.</strong> Allow access in settings.</div>`
      return
    }
    try {
      const heard = await listenOnce()
      input.value = heard
      await send(heard)
      const last = thread[thread.length - 1]
      if (last?.role === "bot") speak(last.text)
    } catch (e: any) {
      errBox.innerHTML = `<div class="notice"><strong>Voice failed.</strong> ${esc(e?.message ?? "")}</div>`
    }
  })
}

function renderLedger(): void {
  const rows = readLedger()
  root.innerHTML = shell(
    `<div class="hero"><h1>Ledger</h1><p>Every agent action, this device. Newest first.</p></div>
    ${rows.length ? `<div id="ledger" class="ag-theme-quartz" style="height:420px"></div>` : `<div class="notice"><strong>Empty ledger.</strong> Act in chat or approvals first.</div>`}`
  )
  const el = document.getElementById("ledger")
  if (el && rows.length) {
    const options: GridOptions = {
      rowData: rows.map((r) => ({
        time: new Date(r.at).toLocaleString(),
        actor: r.actor,
        action: r.action,
        detail: r.detail,
        status: r.status,
      })),
      columnDefs: [
        { field: "time", flex: 1, minWidth: 150 },
        { field: "actor", width: 90 },
        { field: "action", flex: 1, minWidth: 140 },
        { field: "detail", flex: 2, minWidth: 200 },
        { field: "status", width: 100 },
      ],
      domLayout: "autoHeight",
    }
    createGrid(el, options)
  }
}

function renderApprovals(): void {
  const list = readProposals()
  const pending = list.filter((p) => p.state === "pending")
  root.innerHTML = shell(
    `<div class="hero"><h1>Approvals</h1><p>Nothing moves until you approve. Destructive needs this screen.</p></div>
    ${
      pending.length
        ? pending
            .map(
              (p) => `
        <div class="approval" data-id="${esc(p.id)}">
          <strong>${esc(p.title)}</strong>
          <div style="font-size:13px;color:var(--ink-2)">${esc(p.detail)}</div>
          <div class="row">
            <button class="btn" data-ok="${esc(p.id)}">Approve</button>
            <button class="btn ghost" data-no="${esc(p.id)}">Reject</button>
          </div>
        </div>`
            )
            .join("")
        : `<div class="notice"><strong>No approvals needed.</strong> Proposals from chat land here.</div>`
    }`
  )
  root.querySelectorAll("[data-ok]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = (b as HTMLElement).dataset.ok!
      settleProposal(id, "approved")
      logAction("proposal_approved", id, "approved")
      renderApprovals()
    })
  )
  root.querySelectorAll("[data-no]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = (b as HTMLElement).dataset.no!
      settleProposal(id, "rejected")
      logAction("proposal_rejected", id, "rejected")
      renderApprovals()
    })
  )
}

function route(): void {
  const hash = window.location.hash || "#/"
  if (hash === "#/chat") void renderChat()
  else if (hash === "#/ledger") renderLedger()
  else if (hash === "#/approvals") renderApprovals()
  else void renderMarket()
}

window.addEventListener("hashchange", route)
route()
