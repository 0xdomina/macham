import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { PlatformKey } from "./keys.js"

// Key store: hashed records only, never plaintext secrets. Memory for
// tests, atomic JSON file for the reference server. Postgres replaces the
// file backend without touching callers (same interface).

export type UsageDelta = {
  sessions?: number
  modelCalls?: number
}

export type StoredUsage = {
  month: string
  sessions: number
  modelCalls: number
}

export interface KeyStore {
  save(record: PlatformKey): void
  findByFingerprint(fingerprint: string): PlatformKey | null
  list(): PlatformKey[]
  revoke(fingerprint: string): boolean
  addUsage(fingerprint: string, month: string, delta: UsageDelta): StoredUsage | null
  getUsage(fingerprint: string, month: string): StoredUsage
}

export function currentMonth(now = Date.now()): string {
  const d = new Date(now)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export class MemoryKeyStore implements KeyStore {
  private readonly keys = new Map<string, PlatformKey>()
  protected readonly usage = new Map<string, StoredUsage>()

  save(record: PlatformKey): void {
    this.keys.set(record.fingerprint, { ...record })
  }

  findByFingerprint(fingerprint: string): PlatformKey | null {
    const found = this.keys.get(fingerprint)
    return found ? { ...found } : null
  }

  list(): PlatformKey[] {
    return [...this.keys.values()].map((k) => ({ ...k }))
  }

  revoke(fingerprint: string): boolean {
    const found = this.keys.get(fingerprint)
    if (!found) return false
    this.keys.set(fingerprint, { ...found, revokedAt: Date.now() })
    return true
  }

  addUsage(fingerprint: string, month: string, delta: UsageDelta): StoredUsage | null {
    if (!this.keys.has(fingerprint)) return null
    const id = `${fingerprint}:${month}`
    const prev = this.usage.get(id) ?? { month, sessions: 0, modelCalls: 0 }
    const next = {
      month,
      sessions: prev.sessions + Math.max(0, delta.sessions ?? 0),
      modelCalls: prev.modelCalls + Math.max(0, delta.modelCalls ?? 0),
    }
    this.usage.set(id, next)
    return { ...next }
  }

  getUsage(fingerprint: string, month: string): StoredUsage {
    return this.usage.get(`${fingerprint}:${month}`) ?? { month, sessions: 0, modelCalls: 0 }
  }

  protected snapshotUsage(): Record<string, StoredUsage> {
    return Object.fromEntries(this.usage)
  }

  protected restoreUsage(entries: Record<string, StoredUsage>): void {
    for (const [id, value] of Object.entries(entries ?? {})) {
      if (value && typeof value.month === "string") {
        this.usage.set(id, {
          month: value.month,
          sessions: Math.max(0, value.sessions ?? 0),
          modelCalls: Math.max(0, value.modelCalls ?? 0),
        })
      }
    }
  }
}

type FileShape = {
  keys: PlatformKey[]
  usage: Record<string, StoredUsage>
}

export class FileKeyStore extends MemoryKeyStore {
  private readonly path: string

  constructor(path: string) {
    super()
    this.path = path
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as Partial<FileShape>
      for (const record of data.keys ?? []) {
        if (record?.fingerprint) super.save(record)
      }
      this.restoreUsage(data.usage ?? {})
    } catch {
      // Missing or corrupt store fails closed: start empty, never half-load.
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ keys: this.list(), usage: this.snapshotUsage() }))
    renameSync(tmp, this.path)
  }

  override save(record: PlatformKey): void {
    super.save(record)
    this.persist()
  }

  override revoke(fingerprint: string): boolean {
    const ok = super.revoke(fingerprint)
    if (ok) this.persist()
    return ok
  }

  override addUsage(fingerprint: string, month: string, delta: UsageDelta): StoredUsage | null {
    const next = super.addUsage(fingerprint, month, delta)
    if (next) this.persist()
    return next
  }
}
