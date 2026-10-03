import { randomBytes, createHash } from "node:crypto"

// Platform API keys. Shape: mch_live_<rand>_<checksum>. Prefix carries
// zero entropy; the random part does. Test keys never touch live data.
// Secrets are stored hashed; only prefix + fingerprint index ever read.

export type KeyEnv = "live" | "test"

export type KeyScopes = {
  catalog?: boolean
  assist?: boolean
  orders?: boolean
  admin?: boolean
}

export type PlatformKey = {
  id: string
  prefix: string
  env: KeyEnv
  fingerprint: string
  scopes: Required<KeyScopes>
  expiresAt: number | null
  createdAt: number
  revokedAt: number | null
}

const PREFIX = "mch"
const ID_BYTES = 4
const SECRET_BYTES = 24

function checksum(secret: string): string {
  return createHash("sha256")
    .update(secret)
    .digest("hex")
    .slice(0, 8)
}

export function fingerprintOf(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16)
}

/** Mint a key pair. The secret prints ONCE — store the record, show secret. */
export function mintKey(input: {
  env?: KeyEnv
  scopes?: KeyScopes
  expiresInDays?: number | null
}): { record: PlatformKey; secret: string } {
  const env = input.env ?? "test"
  const id = randomBytes(ID_BYTES).toString("hex")
  // Hex, never base64url: the parser splits on "_" and base64url can
  // contain underscores. Deterministic shape beats density.
  const secretBody = randomBytes(SECRET_BYTES).toString("hex")
  const secret = `${PREFIX}_${env}_${secretBody}_${checksum(secretBody)}`
  const now = Date.now()
  return {
    record: {
      id: `key_${id}`,
      prefix: `${PREFIX}_${env}`,
      env,
      fingerprint: fingerprintOf(secret),
      scopes: {
        catalog: input.scopes?.catalog ?? true,
        assist: input.scopes?.assist ?? true,
        orders: input.scopes?.orders ?? false,
        admin: input.scopes?.admin ?? false,
      },
      expiresAt:
        input.expiresInDays == null
          ? null
          : now + input.expiresInDays * 86_400_000,
      createdAt: now,
      revokedAt: null,
    },
    secret,
  }
}

export type ParsedKey = {
  env: KeyEnv
  secretBody: string
  checksum: string
}

/** Parse shape only. Validity (hash match, expiry, revocation) is the
 *  host's job against its key store. Never throws sensitive detail. */
export function parseKey(secret: string): ParsedKey | null {
  const parts = (secret ?? "").split("_")
  if (parts.length !== 4) return null
  const [prefix, env, body, sum] = parts
  if (prefix !== PREFIX) return null
  if (env !== "live" && env !== "test") return null
  if (!body || checksum(body) !== sum) return null
  return { env, secretBody: body, checksum: sum }
}

/** Verify a presented secret against a stored record. Constant-time shape,
 *  explicit reasons the host can log without the secret. */
export function verifyKey(
  record: PlatformKey,
  secret: string,
  now = Date.now()
): { ok: true } | { ok: false; reason: string } {
  const parsed = parseKey(secret)
  if (!parsed) return { ok: false, reason: "Key malformed." }
  if (fingerprintOf(secret) !== record.fingerprint) {
    return { ok: false, reason: "Key mismatch." }
  }
  if (record.revokedAt != null) return { ok: false, reason: "Key revoked." }
  if (record.expiresAt != null && now > record.expiresAt) {
    return { ok: false, reason: "Key expired." }
  }
  return { ok: true }
}

/** Redacted form safe for logs: prefix + fingerprint head. */
export function keyIdForLogs(record: Pick<PlatformKey, "prefix" | "fingerprint">): string {
  return `${record.prefix}_…${record.fingerprint.slice(0, 6)}`
}
