// Extension content entry. Bundled (IIFE) to extension/content.js by
// `npm run build:ext`. Runs in the isolated world, so the Macham key never
// enters the page. When a shopper has configured a key/tenant/assist URL in
// the options page, this mounts the exact same floating widget the snippet and
// SDK mount — the store cannot break it and cannot read the key.

import { mountAssistant } from "./widget/assistant.js"
import { UniversalAdapter } from "./adapters/universal.js"
import { MachamCloudProvider } from "./providers/cloud.js"
import { isKeyShape } from "./auth/key-shape.js"

declare const chrome: any

const FLAGS = "data-macham-widget"

function topFrame(): boolean {
  try {
    return window.self === window.top
  } catch {
    return true
  }
}

async function boot(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return
  if (!topFrame()) return
  if (document.documentElement.hasAttribute(FLAGS)) return
  const cfg = await new Promise<Record<string, string>>((resolve) =>
    chrome.storage.local.get(["machamKey", "machamTenant", "machamAssist"], resolve)
  )
  const apiKey = (cfg.machamKey ?? "").trim()
  const tenantId = (cfg.machamTenant ?? "").trim()
  const assistUrl = (cfg.machamAssist ?? "").trim().replace(/\/$/, "")
  // A key is not needed to be useful here: the widget reads the store page the
  // shopper is already on, so it mounts on every store. The key and a named
  // assist endpoint only add the cloud brain on top, and the endpoint is never
  // inferred from the page, so a configured key cannot be sent to a stranger's
  // site.
  const cloud = isKeyShape(apiKey) && !!assistUrl && !!tenantId

  document.documentElement.setAttribute(FLAGS, "1")
  try {
    mountAssistant(document.body, {
      store: new UniversalAdapter(window.location.origin),
      apiKey: isKeyShape(apiKey) ? apiKey : undefined,
      tenantId: tenantId || undefined,
      assistUrl: assistUrl || undefined,
      ...(cloud ? { brain: new MachamCloudProvider(apiKey, assistUrl) } : {}),
    })
  } catch {
    document.documentElement.removeAttribute(FLAGS)
  }
}

// Re-mount when the shopper edits the config while the tab stays open.
if (typeof chrome !== "undefined" && chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
    if (area !== "local") return
    if (!changes || !Object.keys(changes).some((k) => k.startsWith("macham"))) return
    document.querySelectorAll(".mcm-launcher, .mcm-panel").forEach((n) => n.remove())
    document.documentElement.removeAttribute(FLAGS)
    void boot()
  })
}

// The popup asks the active tab to open its bubble. If nothing is mounted
// (not configured), report back so the popup can send them to options.
if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
    if (msg && typeof msg === "object" && (msg as { type?: string }).type === "macham:open") {
      const launcher = document.querySelector<HTMLButtonElement>(".mcm-launcher")
      const panel = document.querySelector<HTMLElement>(".mcm-panel")
      if (launcher && panel && panel.hasAttribute("hidden")) launcher.click()
      sendResponse({ mounted: Boolean(launcher) })
      return true
    }
    return false
  })
}

void boot()
