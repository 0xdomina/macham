// Key shape check. Zero dependencies, browser-safe. Checksum proof and
// validity stay server-side in keys.ts. Merchants hold only mch_ keys.

/** mch_live_... / mch_test_... pattern. Validity is the host's job. */
export function isKeyShape(secret: string): boolean {
  return /^mch_(live|test)_[0-9a-f]{48}_[0-9a-f]{8}$/.test(secret ?? "")
}
