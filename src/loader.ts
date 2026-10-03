import { mountAssistant } from "./widget/assistant.js"
import type { StoreAdapter } from "./adapters/types.js"
import type { AIProvider } from "./providers/types.js"
import type { AssistantIdentity } from "./assistant/identity.js"

// Single-line integration. The host pastes one script tag plus one init
// call; the bubble appears. No build step on their side, no framework
// needed. Tenant binding comes from their platform key (server-minted,
// never in this bundle).

export type LoaderInit = {
  store: StoreAdapter
  brain: AIProvider
  tenantId: string
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

export function init(opts: LoaderInit): () => void {
  if (!opts || !opts.store || !opts.brain || !opts.tenantId?.trim()) {
    throw new Error("Store, brain, and tenant needed.")
  }
  return mountAssistant(document.body, opts)
}

// Expose the global on load. Hosts with bundlers import { init } instead.
if (typeof window !== "undefined") {
  window.Macham = window.Macham ?? { init }
  void currentScript()
}
