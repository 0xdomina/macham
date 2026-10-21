// Key minting CLI. The secret prints ONCE. The store keeps hashes only.
// Usage: node server/keys.mjs mint [--env test|live] [--orders]
//        node server/keys.mjs revoke <fingerprint-prefix>
//        node server/keys.mjs list

import { readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(ROOT)
const DIST = new URL("../dist/", import.meta.url).href

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#")) continue
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
}
loadEnvFile(resolve(ROOT, ".env"))

const { mintKey } = await import(DIST + "auth/keys.js")
const { FileKeyStore } = await import(DIST + "auth/keystore.js")
const store = new FileKeyStore(process.env.KEYSTORE_PATH ?? "./data/keystore.json")
const [cmd, ...args] = process.argv.slice(2)

if (cmd === "mint") {
  const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : "test"
  const { record, secret } = mintKey({ env: env === "live" ? "live" : "test", scopes: { assist: true, catalog: true, orders: args.includes("--orders") } })
  store.save(record)
  console.log(JSON.stringify({ id: record.id, prefix: record.prefix, fingerprint: record.fingerprint }))
  console.log(secret)
} else if (cmd === "revoke") {
  const prefix = args[0] ?? ""
  const hit = store.list().find((k) => k.fingerprint.startsWith(prefix))
  if (!hit || !store.revoke(hit.fingerprint)) {
    console.log(JSON.stringify({ revoked: false }))
    process.exit(1)
  }
  console.log(JSON.stringify({ revoked: true, id: hit.id }))
} else if (cmd === "list") {
  for (const k of store.list()) {
    console.log(JSON.stringify({ id: k.id, prefix: k.prefix, fingerprint: k.fingerprint.slice(0, 12), revoked: k.revokedAt != null }))
  }
} else {
  console.log("Usage: keys.mjs mint|revoke|list")
  process.exit(1)
}
