// Rialo settlement audit trail (testnet).
//
// Dependency reason: @rialo/ts-cdk is the official Rialo client used to
// anchor audit events. Free-tier path: testnet faucet and requestAirdrop.
// No paid service involved.
//
// Append-only, best-effort event log. Each event is anchored in a testnet
// transaction: a dust self-transfer plus a memo instruction carrying the
// event JSON. Reads scan the audit account history and decode matching memos.
//
// Fail-closed: public functions never throw. They resolve null or [] when
// disabled, unconfigured, oversized, or on any network failure, so audit
// work can never break settlement flows.
//
// Env (writes stay off until provisioned):
//   RIALO_RPC_URL        Testnet RPC endpoint. Defaults to the CDK preset.
//   RIALO_AUDIT_ENABLED  "true" to write. Default false.
//   RIALO_AUDIT_KEY      Base58 secret funding audit writes. Accepts the
//                        32-byte seed or the 64-byte secret. Only the first
//                        32 bytes are used. Fund via the faucet first.
//   RIALO_AUDIT_ADDRESS  Audit account pubkey (base58). Read fallback when
//                        RIALO_AUDIT_KEY is unset.
//   RIALO_AUDIT_TIMEOUT_MS Per-operation cap in ms. Default 15000.

import {
  createRialoClient,
  Keypair,
  PublicKey,
  RIALO_TESTNET_CHAIN,
  Signature,
  SYSTEM_PROGRAM_ID,
  TransactionBuilder,
  transferInstruction,
} from "@rialo/ts-cdk"

export type AuditEventInput = {
  kind: string
  /** Stable business reference, e.g. a quote or order id. */
  ref: string
  /** Who acted. Null when unknown. Never a secret. */
  actor?: string | null
  /** Small JSON-serialisable detail bag. Never secrets. */
  payload?: Record<string, unknown>
}

export type AuditEventRecord = {
  signature: string
  blockTime?: number
  kind: string
  ref: string
  actor: string | null
  payload: Record<string, unknown>
}

const MEMO_TAG = "MACHAM/1:"
const MAX_MEMO_BYTES = 768
const SCAN_LIMIT = 50
const FETCH_LIMIT = 25
const DUST_KELVIN = 1n
const KIND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MAX_REF_LENGTH = 160
const MAX_ACTOR_LENGTH = 320

const B58_DIGITS =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function decodeBase58(text: string): Uint8Array {
  let leadingOnes = 0
  while (leadingOnes < text.length && text[leadingOnes] === "1") {
    leadingOnes += 1
  }
  let value = 0n
  for (const char of text) {
    const digit = B58_DIGITS.indexOf(char)
    if (digit < 0) throw new Error("Bad encoding.")
    value = value * 58n + BigInt(digit)
  }
  const reversed: number[] = []
  while (value > 0n) {
    reversed.push(Number(value & 0xffn))
    value >>= 8n
  }
  const body = reversed.reverse()
  const out = new Uint8Array(leadingOnes + body.length)
  out.set(body, leadingOnes)
  return out
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainRecord(value) ? value : null
}

function serialisable(value: unknown): boolean {
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

function validInput(input: unknown): input is AuditEventInput {
  const candidate = asRecord(input)
  if (!candidate) return false
  if (typeof candidate.kind !== "string" || !KIND_PATTERN.test(candidate.kind)) {
    return false
  }
  if (typeof candidate.ref !== "string") return false
  const ref = candidate.ref.trim()
  if (!ref || ref.length > MAX_REF_LENGTH) return false
  if (candidate.actor !== undefined && candidate.actor !== null) {
    if (typeof candidate.actor !== "string") return false
    if (candidate.actor.length > MAX_ACTOR_LENGTH) return false
  }
  if (candidate.payload !== undefined) {
    if (!isPlainRecord(candidate.payload)) return false
    if (!serialisable(candidate.payload)) return false
  }
  return true
}

function writeEnabled(): boolean {
  const raw = (process.env.RIALO_AUDIT_ENABLED ?? "false").trim().toLowerCase()
  return raw === "true" || raw === "1"
}

function rpcEndpoint(): string {
  const raw = process.env.RIALO_RPC_URL?.trim()
  return raw ? raw : RIALO_TESTNET_CHAIN.rpcUrl
}

function operationTimeoutMs(): number {
  const raw = Number(process.env.RIALO_AUDIT_TIMEOUT_MS ?? "15000")
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15000
}

function auditClient(): ReturnType<typeof createRialoClient> {
  return createRialoClient({
    chain: { ...RIALO_TESTNET_CHAIN, rpcUrl: rpcEndpoint() },
    transport: { timeout: operationTimeoutMs() },
  })
}

function loadAuditKey(): Keypair | null {
  const raw = process.env.RIALO_AUDIT_KEY?.trim()
  if (!raw) return null
  try {
    const bytes = decodeBase58(raw)
    const seed = bytes.length === 64 ? bytes.slice(0, 32) : bytes
    if (seed.length !== 32) return null
    return Keypair.fromSecretKey(seed)
  } catch {
    return null
  }
}

function readAddress(key: Keypair | null): PublicKey | null {
  try {
    if (key) return key.publicKey
    const raw = process.env.RIALO_AUDIT_ADDRESS?.trim()
    if (!raw) return null
    return PublicKey.fromString(raw)
  } catch {
    return null
  }
}

function encodeMemo(input: AuditEventInput): Uint8Array | null {
  try {
    const envelope = {
      v: 1,
      kind: input.kind,
      ref: input.ref.trim(),
      actor: input.actor ?? null,
      at: new Date().toISOString(),
      payload: input.payload ?? {},
    }
    let text = MEMO_TAG + JSON.stringify(envelope)
    if (new TextEncoder().encode(text).length > MAX_MEMO_BYTES) {
      text = MEMO_TAG + JSON.stringify({ ...envelope, payload: { truncated: true } })
    }
    const bytes = new TextEncoder().encode(text)
    return bytes.length > MAX_MEMO_BYTES ? null : bytes
  } catch {
    return null
  }
}

function matchMemo(
  response: unknown,
  ref: string,
  signature: string
): AuditEventRecord | null {
  try {
    const root = asRecord(response)
    if (!root) return null
    if (asRecord(root.meta)?.err) return null
    const instructions = asRecord(asRecord(root.transaction)?.message)?.instructions
    if (!Array.isArray(instructions)) return null
    for (const entry of instructions) {
      const data = asRecord(entry)?.data
      if (typeof data !== "string" || !data) continue
      let text: string
      try {
        text = new TextDecoder().decode(decodeBase58(data))
      } catch {
        continue
      }
      if (!text.startsWith(MEMO_TAG)) continue
      let event: unknown
      try {
        event = JSON.parse(text.slice(MEMO_TAG.length)) as unknown
      } catch {
        continue
      }
      const body = asRecord(event)
      if (!body || body.ref !== ref) continue
      const blockTime = asRecord(response)?.blockTime
      return {
        signature,
        ...(typeof blockTime === "bigint" ? { blockTime: Number(blockTime) } : {}),
        kind: typeof body.kind === "string" ? body.kind : "unknown",
        ref,
        actor: typeof body.actor === "string" ? body.actor : null,
        payload: asRecord(body.payload) ?? {},
      }
    }
    return null
  } catch {
    return null
  }
}

function stringifySignature(sent: unknown): string | null {
  try {
    if (typeof sent === "string") return sent || null
    if (sent instanceof Signature) return sent.toString() || null
    if (sent instanceof Uint8Array) return Signature.fromBytes(sent).toString()
    return null
  } catch {
    return null
  }
}

function withCap<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out.")), ms)
  })
  return Promise.race([task, guard]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

/** True when audit writes are enabled and a usable key is present. */
export function isRialoAuditConfigured(): boolean {
  try {
    if (!writeEnabled()) return false
    const key = loadAuditKey()
    if (!key) return false
    try {
      key.dispose()
    } catch {
      // Best-effort cleanup only.
    }
    return true
  } catch {
    return false
  }
}

/**
 * Anchor a settlement event on Rialo testnet. Best-effort: resolves to the
 * transaction signature, or null when the input is invalid, writes are
 * disabled, the key is missing, the event is oversized, or on any
 * network failure. Never throws.
 */
export async function appendAuditEvent(
  input: AuditEventInput
): Promise<string | null> {
  try {
    if (!validInput(input)) return null
    if (!writeEnabled()) return null
    const key = loadAuditKey()
    if (!key) return null
    try {
      const memo = encodeMemo(input)
      if (!memo) return null
      const client = auditClient()
      const ms = operationTimeoutMs()
      const prefix = await withCap(client.getConfigHashPrefix(), ms)
      const payer = key.publicKey
      const signed = TransactionBuilder.create()
        .setPayer(payer)
        .setValidFrom(BigInt(Date.now()))
        .setConfigHashPrefix(prefix)
        .addInstruction(transferInstruction(payer, payer, DUST_KELVIN))
        .addInstruction({
          programId: PublicKey.fromString(SYSTEM_PROGRAM_ID),
          accounts: [{ pubkey: payer, isSigner: true, isWritable: false }],
          data: memo,
        })
        .build()
        .sign(key)
      const sent = await withCap(client.sendTransaction(signed.serialize()), ms)
      return stringifySignature(sent as unknown)
    } finally {
      try {
        key.dispose()
      } catch {
        // Best-effort cleanup only.
      }
    }
  } catch {
    return null
  }
}

/**
 * Read back audit events for a business reference. Best-effort: resolves
 * to matching records, or [] when the reference is invalid, no audit
 * account is configured, or on any network failure. Never throws.
 */
export async function readAuditEvents(ref: string): Promise<AuditEventRecord[]> {
  try {
    if (typeof ref !== "string") return []
    const needle = ref.trim()
    if (!needle || needle.length > MAX_REF_LENGTH) return []
    const key = loadAuditKey()
    try {
      const address = readAddress(key)
      if (!address) return []
      const client = auditClient()
      const ms = operationTimeoutMs()
      const history = await withCap(
        client.getSignaturesForAddress(address, { limit: SCAN_LIMIT }),
        ms
      )
      const out: AuditEventRecord[] = []
      for (const info of (history ?? []).slice(0, FETCH_LIMIT)) {
        if (!info || info.err) continue
        try {
          const response = await withCap(
            client.getTransaction(Signature.fromString(info.signature).toBytes()),
            ms
          )
          const record = matchMemo(response, needle, info.signature)
          if (record) out.push(record)
        } catch {
          continue
        }
      }
      return out
    } finally {
      try {
        key?.dispose()
      } catch {
        // Best-effort cleanup only.
      }
    }
  } catch {
    return []
  }
}
