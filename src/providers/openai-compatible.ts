import type { AIProvider, ChatMessage, ChatResult } from "./types.js"

// One client for every OpenAI-compatible chat API (Groq, DeepSeek, OpenAI,
// and friends). SERVER-ONLY: model keys live on the Macham server, never in
// merchant bundles. Merchants hold only their mch_ API key. Not exported
// from the package root.

export type OpenAICompatibleOptions = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs?: number
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly model: string
  private readonly timeoutMs: number

  constructor(opts: OpenAICompatibleOptions) {
    if (typeof window !== "undefined") {
      throw new Error("Provider keys run server-side only.")
    }
    if (!opts.apiKey) throw new Error(`${opts.name}: API key needed`)
    this.name = opts.name
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.apiKey = opts.apiKey
    this.model = opts.model
    this.timeoutMs = opts.timeoutMs ?? 30_000
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts?.maxTokens ?? 512,
        temperature: opts?.temperature ?? 0.3,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error(`${this.name} answered ${res.status}`)
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = body.choices?.[0]?.message?.content?.trim() ?? ""
    if (!text) throw new Error(`${this.name} returned no text`)
    return { text, model: this.model }
  }
}

// Default model verified live 2026-10-03. Groq retires ids without warning;
// the gateway overrides via GROQ_MODEL. Never hardcode a dead id.

export function groqProvider(apiKey: string, model = "qwen/qwen3.8-27b"): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey,
    model,
  })
}

export function deepseekProvider(apiKey: string, model = "deepseek-chat"): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey,
    model,
  })
}
