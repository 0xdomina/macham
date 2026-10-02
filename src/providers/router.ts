import type { AIProvider, ChatMessage, ChatResult } from "./types.js"

// Provider router: named providers, enabled list, failover with
// last-success stickiness. Provider identity never leaves the server:
// callers see text, never model names.

export type RouterOptions = {
  providers: AIProvider[]
  enabled?: string[]
  timeoutMs?: number
  maxAttempts?: number
  onUsage?: (info: { provider: string; ok: boolean }) => void
}

export class ProviderUnavailableError extends Error {
  readonly failedProviders: string[]
  constructor(failedProviders: string[]) {
    super("No provider answered. Retry.")
    this.name = "ProviderUnavailableError"
    this.failedProviders = failedProviders
  }
}

export class ProviderRouter implements AIProvider {
  readonly name = "router"
  private readonly providers: AIProvider[]
  private readonly enabled: Set<string> | null
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly onUsage?: RouterOptions["onUsage"]
  private lastSuccess: string | null = null

  constructor(opts: RouterOptions) {
    if (!opts.providers.length) throw new Error("Router needs providers")
    this.providers = opts.providers
    this.enabled = opts.enabled ? new Set(opts.enabled) : null
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? opts.providers.length)
  }

  private order(): AIProvider[] {
    const eligible = this.enabled
      ? this.providers.filter((p) => this.enabled!.has(p.name))
      : [...this.providers]
    if (!eligible.length) throw new ProviderUnavailableError([])
    if (this.lastSuccess) {
      const i = eligible.findIndex((p) => p.name === this.lastSuccess)
      if (i > 0) {
        const [hit] = eligible.splice(i, 1)
        eligible.unshift(hit)
      }
    }
    return eligible
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<ChatResult> {
    const failed: string[] = []
    for (const provider of this.order().slice(0, this.maxAttempts)) {
      try {
        const result = await withTimeout(
          provider.chat(messages, opts),
          this.timeoutMs
        )
        this.lastSuccess = provider.name
        this.onUsage?.({ provider: provider.name, ok: true })
        // Identity stays inside: callers get text only.
        return { text: result.text, model: "assistant" }
      } catch {
        failed.push(provider.name)
        this.onUsage?.({ provider: provider.name, ok: false })
      }
    }
    throw new ProviderUnavailableError(failed)
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Provider timed out")), ms)
  })
  return Promise.race([work.finally(() => clearTimeout(timer)), timeout])
}

// Deterministic offline double. Canned replies keyed by tag for tests;
// "fail" mode proves the failover path without network.
export class MockProvider implements AIProvider {
  readonly name: string
  private readonly replies: Record<string, string>
  private readonly fail: boolean

  constructor(name = "mock", replies: Record<string, string> = {}, fail = false) {
    this.name = name
    this.replies = replies
    this.fail = fail
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    if (this.fail) throw new Error(`${this.name} is down (mock)`)
    const last = messages[messages.length - 1]?.content ?? ""
    const tag = Object.keys(this.replies).find((k) => last.includes(k))
    return { text: tag ? this.replies[tag] : "Mock reply.", model: this.name }
  }
}
