import type { BrowserLane, LaneFactory, LaneResult, PageAction } from "./lane.js"
import { LANE_ACTION_BUDGET } from "./lane.js"

// Kernel browser lane (api.onkernel.com, Bearer key, server-side only).
// Read-only discovery: goto plus extract. Clicks, fills, and logins refuse
// by doctrine (FEATURES anti-scope: no credential injection, no auto-buy).
// Missing key fails closed. Live proof needs KERNEL_API_KEY.

const API = "https://api.onkernel.com"

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export function kernelLaneFactory(apiKey: string, fetcher: Fetcher = fetch): LaneFactory {
  if (!apiKey) throw new Error("Kernel key needed.")
  return async (input) => {
    const url = (input.url ?? "").trim()
    if (!/^https?:\/\//.test(url)) throw new Error("Page URL needed.")
    const call = async (method: string, path: string, body?: unknown): Promise<any> => {
      const res = await fetcher(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 401) throw new Error("Kernel key rejected.")
      if (res.status === 429) throw new Error("Kernel throttled. Retry.")
      if (!res.ok) throw new Error(`Kernel answered ${res.status}.`)
      return res.json().catch(() => ({}))
    }
    const created = await call("POST", "/browsers", {
      headless: input.headless ?? true,
      timeout_seconds: 300,
    })
    const id = String(created.session_id ?? created.id ?? "")
    if (!id) throw new Error("Kernel session failed.")
    let actions = 0
    const run = async (code: string): Promise<any> => {
      if (actions >= LANE_ACTION_BUDGET) throw new Error("Lane budget spent.")
      actions += 1
      const out = await call("POST", `/browsers/${encodeURIComponent(id)}/playwright/execute`, {
        code,
        timeout_sec: 60,
      })
      if (!out.success) throw new Error("Page action failed.")
      return out.result
    }
    const lane: BrowserLane = {
      name: "kernel",
      async goto(target: string): Promise<LaneResult> {
        try {
          await run(`await page.goto(${JSON.stringify(target)}); return page.url();`)
          return { ok: true }
        } catch {
          return { ok: false, reason: "Page unreachable." }
        }
      },
      async act(action: PageAction): Promise<LaneResult> {
        if (action.kind !== "extract") return { ok: false, reason: "Read-only lane." }
        try {
          const data = await run(
            `return await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent).join("\\n"));`
          )
          return { ok: true, data: typeof data === "string" ? data.slice(0, 200_000) : data }
        } catch {
          return { ok: false, reason: "Extract failed." }
        }
      },
      async close(): Promise<void> {
        try {
          await call("DELETE", `/browsers/${encodeURIComponent(id)}`)
        } catch {
          // Sessions expire server-side. Silence is correct.
        }
      },
    }
    return lane
  }
}
