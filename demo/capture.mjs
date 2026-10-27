// Captures the film's narration from the product's own gateway, then freezes it.
//
//   node demo/capture.mjs              live: boots server/assist.mjs against a
//                                      SCRATCH keystore, mints an mch_test_ key,
//                                      sends the exact prompt the browser will
//                                      send to POST /v1/assist, saves the JSON.
//   node demo/capture.mjs --stub       fallback: no gateway, no model key. Writes a
//                                      deterministic stub reply marked stub:true so
//                                      NOTES.md can state the words were not live.
//
// Safety: the gateway child reads .env itself; this script never prints or copies a
// value from it. The minted key is written to demo/out/scratch/ (gitignored) only.
// The repo's real data/keystore.json is never opened — KEYSTORE_PATH is overridden.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SCRATCH = join(HERE, "out", "scratch");
const FIXDIR = join(HERE, "fixtures");
const PORT = Number(process.env.FILM_GATE_PORT || 0);
const USE_STUB = process.argv.includes("--stub");

mkdirSync(SCRATCH, { recursive: true });
mkdirSync(FIXDIR, { recursive: true });

// Every env override the sandbox boot needs. Nothing else is added to the child's
// environment, so the gateway sees the repo's own .env exactly as it ships.
const GATE = {
  ASSIST_PORT: String(PORT),
  KEYSTORE_PATH: join(SCRATCH, "keystore.json"),
};
if (process.env.FILM_GATE_MODEL) GATE.GROQ_MODEL = process.env.FILM_GATE_MODEL;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const core = await import("./build/film-core.mjs");
const store = new core.FilmStoreAdapter();

// The one shopper line the film types into the widget composer.
const FILM_MESSAGE = "i need a parka or a shell";

// ---- tee: keep the byte-exact request the product sends -------------------
let lastCapture = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const res = await realFetch(input, init);
  if (/\/v1\/assist$/.test(url) && init && String(init.method).toUpperCase() === "POST") {
    const body = JSON.parse(String(init.body));
    const text = await res.clone().text();
    lastCapture = { request: body, status: res.status, raw: text };
  }
  return res;
};

/** The messages array the real code builds for the film's line. */
async function promptFor(message) {
  let captured = null;
  const harness = core.createFilmHarness({
    name: "probe",
    async chat(m) {
      captured = m;
      return { text: JSON.stringify({ summary: "probe probe probe probe" }), model: "probe" };
    },
  });
  await core.runFilmTurn(harness, [], message);
  return captured;
}

async function freePort() {
  const { createServer } = await import("node:net");
  return await new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

async function startGateway() {
  const port = PORT || (await freePort());
  const child = spawn(process.execPath, ["server/assist.mjs"], {
    cwd: ROOT,
    env: { ...process.env, ...GATE, ASSIST_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const noise = [];
  child.stdout.on("data", (d) => noise.push(String(d)));
  child.stderr.on("data", (d) => noise.push(String(d)));
  child.on("exit", (code) => noise.push("[gateway exited " + code + "]"));
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) break;
    try {
      const r = await realFetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) {
        const health = await r.json();
        // Prove we are talking to this repo's gateway, not some other service that
        // happens to hold the port: server/assist.mjs answers { ok, plan, uptime_s }.
        if (!("plan" in health)) throw new Error(`port ${port} answered by a different service: ${JSON.stringify(health)}`);
        return { child, health, noise, port };
      }
    } catch (e) {
      if (/different service/.test(String(e?.message))) throw e;
    }
    await sleep(250);
  }
  child.kill("SIGTERM");
  throw new Error("gateway never answered /health on port " + port + ": " + noise.join("").slice(0, 700));
}

function mintTestKey() {
  const r = spawnSync(process.execPath, ["server/keys.mjs", "mint", "--env", "test"], {
    cwd: ROOT,
    env: { ...process.env, ...GATE },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error("keys.mjs mint failed: " + String(r.stderr).slice(0, 300));
  const lines = String(r.stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("keys.mjs mint printed nothing usable");
  const meta = JSON.parse(lines[0]);
  const secret = lines[lines.length - 1];
  // Stays in the scratch dir; never printed, never written to a tracked file.
  writeFileSync(join(SCRATCH, "minted-test-key.txt"), secret + "\n");
  return { meta, secret };
}

async function liveCapture() {
  const { child, health, noise, port } = await startGateway();
  console.log(`gateway /health on ${port} ` + JSON.stringify(health));
  try {
    const { meta, secret } = mintTestKey();
    console.log("minted scratch test key " + JSON.stringify(meta));
    const brain = new core.MachamCloudProvider(secret, `http://127.0.0.1:${port}`);
    const harness = core.createFilmHarness(brain);
    // The contract at src/buyer/shop.ts:55-61 requires JSON, and the model at
    // temperature 0.3 sometimes answers in prose — chatTurn then throws and the
    // widget shows "Something failed. Try again." Re-asking the same grounded
    // prompt is the honest way to obtain the product's own valid narration; the
    // rejected replies stay in demo/out/scratch/attempts.json.
    const tries = Number(process.env.FILM_GATE_TRIES || 6);
    const attempts = [];
    let turn = null;
    for (let i = 0; i < tries && !turn; i++) {
      lastCapture = null;
      try {
        turn = await core.runFilmTurn(harness, [], FILM_MESSAGE);
      } catch (e) {
        attempts.push({
          n: i + 1,
          status: lastCapture?.status ?? null,
          raw: lastCapture?.raw ?? null,
          refused: String(e?.message ?? e),
        });
        console.log(`attempt ${i + 1} rejected: ${String(e?.message ?? e)} | ${(lastCapture?.raw ?? "").slice(0, 220)}`);
      }
    }
    writeFileSync(join(SCRATCH, "attempts.json"), JSON.stringify(attempts, null, 2) + "\n");
    if (!turn) throw new Error("the gateway never produced a contract-valid answer in " + tries + " tries");
    if (!lastCapture) throw new Error("no /v1/assist call was recorded");
    if (lastCapture.status !== 200) throw new Error("gateway answered " + lastCapture.status + ": " + lastCapture.raw.slice(0, 200));
    return {
      stub: false,
      capturedAt: new Date().toISOString(),
      origin: "live POST /v1/assist on server/assist.mjs, scratch keystore, minted mch_test_ key",
      rejectedAttempts: attempts.length,
      request: lastCapture.request,
      response: JSON.parse(lastCapture.raw),
      onScreen: turn.reply.text,
      intent: turn.reply.intent,
    };
  } finally {
    child.kill("SIGTERM");
    if (noise.length) writeFileSync(join(SCRATCH, "gateway-log.txt"), noise.join(""));
  }
}

function stubCapture(request) {
  const hits = store.listProducts({ query: "need parka shell", limit: 6 });
  const labels = hits.map((p) => `${p.title} — ${core.priceLabel(p)}`);
  return {
    stub: true,
    capturedAt: new Date().toISOString(),
    origin: "deterministic stub brain: NOT a live model call",
    request,
    response: {
      text: JSON.stringify({
        summary: `Two matches: ${labels.join(" and ")}. The Harbor Parka at USD 42.00 is the lower price of the pair.`,
      }),
    },
    onScreen: `Two matches: ${labels.join(" and ")}. The Harbor Parka at USD 42.00 is the lower price of the pair.`,
  };
}

const messages = await promptFor(FILM_MESSAGE);
const request = { messages, max_tokens: 512, temperature: 0.3 };
let record;
try {
  record = USE_STUB ? stubCapture(request) : await liveCapture();
} catch (e) {
  console.log("live capture failed — " + String(e.message).slice(0, 400));
  if (USE_STUB) throw e;
  console.log("re-run with --stub to freeze the deterministic fallback (and say so in NOTES.md)");
  process.exit(2);
}

const base = join(FIXDIR, "assist-1");
writeFileSync(base + ".request.json", JSON.stringify(record.request, null, 2) + "\n");
writeFileSync(base + ".json", JSON.stringify(record.response, null, 2) + "\n");
writeFileSync(
  base + ".meta.json",
  JSON.stringify(
    {
      stub: Boolean(record.stub),
      capturedAt: record.capturedAt,
      origin: record.origin,
      endpoint: "POST /v1/assist (src/providers/cloud.ts:28)",
      typedByBuyer: FILM_MESSAGE,
      replyOnScreen: record.onScreen,
      intent: record.intent ?? null,
    },
    null,
    2
  ) + "\n"
);
console.log("wrote " + base + ".json  (stub=" + Boolean(record.stub) + ")");
console.log("on screen: " + record.onScreen);
