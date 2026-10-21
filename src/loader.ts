import { mountAssistant } from "./widget/assistant.js"
import type { StoreAdapter } from "./adapters/types.js"
import { UniversalAdapter } from "./adapters/universal.js"
import type { AssistantIdentity } from "./assistant/identity.js"
import { MachamCloudProvider } from "./providers/cloud.js"
import { isKeyShape } from "./auth/key-shape.js"

// Single-line integration. The host pastes one script tag plus one init
// call; the bubble appears. No build step on their side, no framework
// needed. The merchant holds only their Macham API key (mch_live_...):
// model keys live on the Macham server, metered per key.
//
// Zero-code default: omit `store` and the loader reads the host store
// itself (Shopify, Woo, JSON-LD auto-detect, same-origin public reads).
// Custom backends pass their own adapter instead.

export type LoaderInit = {
  store?: StoreAdapter | "auto"
  apiKey: string
  tenantId: string
  assistUrl?: string
  identity?: Partial<AssistantIdentity>
  onProposal?: (proposal: { action: string; productId?: string; title?: string; qty?: number }) => void
}

declare global {
  interface Window {
    Macham?: {
      init: (opts: LoaderInit) => () => void
    }
  }
}

function currentScript(): HTMLScriptElement | null {
  const direct = document.currentScript
  if (direct instanceof HTMLScriptElement) return direct
  const scripts = document.getElementsByTagName("script")
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].getAttribute("src") ?? ""
    if (src.includes("macham")) return scripts[i] as HTMLScriptElement
  }
  return null
}

function defaultAssistUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8787"
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return "http://localhost:8787"
  return window.location.origin
}

export function init(opts: LoaderInit): () => void {
  if (!opts || !isKeyShape(opts.apiKey ?? "") || !opts.tenantId?.trim()) {
    throw new Error("Macham API key and tenant needed.")
  }
  const store =
    !opts.store || opts.store === "auto"
      ? new UniversalAdapter(window.location.origin)
      : opts.store
  const assistUrl = opts.assistUrl ?? defaultAssistUrl()
  return mountAssistant(document.body, {
    store,
    apiKey: opts.apiKey,
    tenantId: opts.tenantId,
    assistUrl,
    identity: opts.identity,
    onProposal: opts.onProposal,
    brain: new MachamCloudProvider(opts.apiKey, assistUrl),
  })
}

// Expose the global on load. Hosts with bundlers import { init } instead.
if (typeof window !== "undefined") {
  window.Macham = window.Macham ?? { init }
  void currentScript()
}
