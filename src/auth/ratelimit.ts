// Per-key fixed-window rate limiter. Memory only; hosts with many
// processes put the real limit in Redis. Fail-closed on misuse, never on use.

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number

  constructor(maxPerWindow = 60, windowMs = 60_000) {
    this.max = Math.max(1, maxPerWindow)
    this.windowMs = Math.max(1_000, windowMs)
  }

  /** True when the call may proceed. Records the hit. */
  take(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }
}
