// Rialo settlement audit trail (devnet for free testing, testnet for judging).
//
// Dependency reason: @rialo/ts-cdk is the official Rialo client used to
// anchor audit events. Free-tier path: programmatic requestAirdrop on
// devnet/testnet over standard port 443 (the CDK default :4101 is blocked
// on strict egress; override with RIALO_RPC_URL). No paid service involved.
//
// Append-only, best-effort event log. Each event is anchored in a network
// transaction: a dust self-transfer plus a Memo-program instruction carrying
// the event JSON. Verified on devnet 2026-10-03: transfer-only and
// transfer-plus-memo land; memo data addressed to the system program does
// NOT land (silently dropped). Reads scan the audit account history and
// decode matching memos. RPC shapes are accepted in both camelCase (port
// 443) and snake_case (CDK native) forms.
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
//   RIALO_NETWORK        "devnet" for free faucet testing, "testnet" for the
//                        judging path. Default "testnet". Flip freely: keys
//                        are network-agnostic, no reprovisioning needed.
//   RIALO_RPC_URL        Custom RPC endpoint. Defaults to the active preset.
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
  RIALO_DEVNET_CHAIN,
  RIALO_TESTNET_CHAIN,
  Signature,
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
// Memo program: the only vehicle that lands arbitrary bytes. Verified live
// on devnet. Never address memo data to the system program (dropped).
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"

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

function activeChain(): typeof RIALO_TESTNET_CHAIN {
  const raw = (process.env.RIALO_NETWORK ?? "testnet").trim().toLowerCase()
  return raw === "devnet" ? RIALO_DEVNET_CHAIN : RIALO_TESTNET_CHAIN
}

function rpcEndpoint(): string {
  const raw = process.env.RIALO_RPC_URL?.trim()
  return raw ? raw : activeChain().rpcUrl
}

function operationTimeoutMs(): number {
  const raw = Number(process.env.RIALO_AUDIT_TIMEOUT_MS ?? "15000")
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15000
}

function auditClient(): ReturnType<typeof createRialoClient> {
  return createRialoClient({
    chain: { ...activeChain(), rpcUrl: rpcEndpoint() },
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

/**
 * Decode on-chain instruction data to memo text. Base58 first (the observed
 * wire form), base64 as fallback. Pure and exported for offline tests.
 * Returns null when the input decodes to nothing usable.
 */
export function decodeAuditMemo(data: unknown): string | null {
  if (typeof data !== "string" || !data) return null
  const attempts: Uint8Array[] = []
  try {
    attempts.push(decodeBase58(data))
  } catch {
    // Not base58. Fall through to base64.
  }
  if (!attempts.length && /^[A-Za-z0-9+/=_-]+$/.test(data)) {
    try {
      const raw = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
      if (raw.length) attempts.push(new Uint8Array(raw))
    } catch {
      // Not base64 either.
    }
  }
  for (const bytes of attempts) {
    if (!bytes.length || bytes.length > MAX_MEMO_BYTES + 64) continue
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      if (text) return text
    } catch {
      continue
    }
  }
  return null
}

function matchMemo(
  details: unknown,
  ref: string,
  signature: string
): AuditEventRecord | null {
  try {
    const root = asRecord(details)
    if (!root) return null
    // RPC speaks camelCase on 443, snake_case on native CDK ports. Take both.
    const tx = asRecord(root.transaction) ?? asRecord(root.result)
    const message = asRecord(tx?.message)
    const instructions = message?.instructions ?? message?.compiledInstructions
    if (!Array.isArray(instructions)) return null
    const meta = asRecord(root.meta)
    if (meta?.err != null) return null
    for (const entry of instructions) {
      const text = decodeAuditMemo(asRecord(entry)?.data)
      if (!text || !text.startsWith(MEMO_TAG)) continue
      let event: unknown
      try {
        event = JSON.parse(text.slice(MEMO_TAG.length)) as unknown
      } catch {
        continue
      }
      const body = asRecord(event)
      if (!body || body.ref !== ref) continue
      const blockTime = root.block_time ?? root.blockTime
      return {
        signature,
        ...(typeof blockTime === "number" || typeof blockTime === "bigint"
          ? { blockTime: Number(blockTime) }
          : {}),
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

/** Full transaction details over plain RPC. Never throws sensitive detail. */
async function fetchTransactionDetails(signature: string, ms: number): Promise<unknown> {
  const res = await fetch(rpcEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [{ signature }] }),
    signal: AbortSignal.timeout(ms),
  })
  if (!res.ok) throw new Error("Audit read unavailable. Retry.")
  const body = (await res.json()) as { result?: unknown }
  return body.result ?? null
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
          programId: PublicKey.fromString(MEMO_PROGRAM_ID),
          accounts: [],
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
        const signature = typeof info?.signature === "string" ? info.signature : null
        if (!signature || info?.err != null) continue
        try {
          // The CDK summary call omits instructions, so fetch full details
          // over plain RPC (same endpoint, correct [{ signature }] shape).
          const response = await withCap(fetchTransactionDetails(signature, ms), ms)
          const record = matchMemo(response, needle, signature)
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
