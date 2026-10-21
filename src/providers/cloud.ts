import type { AIProvider, ChatMessage, ChatResult } from "./types.js"
import { isKeyShape } from "../auth/key-shape.js"

// Macham cloud brain. Merchants hold only their mch_ API key. Model keys
// live on the Macham server behind the assist endpoint, metered per key
// against plan limits (sessions + model calls). Provider identity never
// reaches the browser: callers see text, never model names.

export class MachamCloudProvider implements AIProvider {
  readonly name = "macham-cloud"
  private readonly assistUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number

  constructor(apiKey: string, assistUrl: string, timeoutMs = 30_000) {
    if (!isKeyShape(apiKey ?? "")) throw new Error("Macham API key needed.")
    const base = (assistUrl ?? "").trim().replace(/\/$/, "")
    if (!base) throw new Error("Assist endpoint needed.")
    this.apiKey = apiKey
    this.assistUrl = base
    this.timeoutMs = timeoutMs
  }

  async chat(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number }
  ): Promise<ChatResult> {
    const res = await fetch(`${this.assistUrl}/v1/assist`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        messages,
        max_tokens: opts?.maxTokens ?? 512,
        temperature: opts?.temperature ?? 0.3,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (res.status === 401) throw new Error("Key rejected. Check the dashboard.")
    if (res.status === 429) throw new Error("Plan limit reached. Upgrade to continue.")
    if (!res.ok) throw new Error("Assistant service unavailable. Retry.")
    const body = (await res.json()) as { text?: string }
    const text = (body.text ?? "").trim()
    if (!text) throw new Error("Assistant service unavailable. Retry.")
    return { text, model: "assistant" }
  }
}
