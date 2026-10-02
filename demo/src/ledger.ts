// Session ledger: every agent action recorded locally with actor + time.
// Real user actions, never fabricated. Exportable as evidence.

export type LedgerEntry = {
  id: string
  at: string
  actor: string
  action: string
  detail: string
  status: "done" | "approved" | "rejected" | "info"
}

const KEY = "macham-demo-ledger-v1"

export function readLedger(): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function logAction(action: string, detail: string, status: LedgerEntry["status"] = "done", actor = "you"): LedgerEntry {
  const entry: LedgerEntry = {
    id: `l_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    at: new Date().toISOString(),
    actor,
    action,
    detail,
    status,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...readLedger()].slice(0, 200)))
  } catch {
    // Private mode. Memory only.
  }
  return entry
}

export type Proposal = {
  id: string
  title: string
  detail: string
  createdAt: string
  state: "pending" | "approved" | "rejected"
}

const PKEY = "macham-demo-approvals-v1"

export function readProposals(): Proposal[] {
  try {
    const raw = localStorage.getItem(PKEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeProposals(list: Proposal[]): void {
  try {
    localStorage.setItem(PKEY, JSON.stringify(list.slice(0, 100)))
  } catch {
    // ignore
  }
}

export function addProposal(title: string, detail: string): Proposal {
  const p: Proposal = {
    id: `p_${Date.now().toString(36)}`,
    title,
    detail,
    createdAt: new Date().toISOString(),
    state: "pending",
  }
  writeProposals([p, ...readProposals()])
  return p
}

export function settleProposal(id: string, state: "approved" | "rejected"): void {
  writeProposals(readProposals().map((p) => (p.id === id ? { ...p, state } : p)))
}
