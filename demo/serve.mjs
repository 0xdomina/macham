// Minimal static host for the film: the shell, the neutral storefront page, and
// the one demo bundle — all under demo/. The gateway is NOT part of the render;
// its answers come from demo/fixtures/*.json frozen by demo/capture.mjs.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, ".."); // the macham repo
const PORT = Number(process.env.FILM_PORT || 8913);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".ico": "image/x-icon",
};

// Everything is served out of demo/. Nothing from the app's own source tree is
// exposed, and nothing is copied at request time — the bundle is built by
// demo/build.mjs.
const ALLOWED = [HERE];

async function pick(path) {
  if (path === "/" || path.startsWith("/index")) return join(HERE, "index.html");
  if (path.startsWith("/fixtures/") || path.startsWith("/build/")) return join(HERE, path.slice(1));
  return join(HERE, path.slice(1));
}

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || "/").split("?")[0]);
  if (path === "/favicon.ico") {
    res.writeHead(204).end(); // the film is offline; no icon, no 404 in the console
    return;
  }
  const file = await pick(path);
  if (!ALLOWED.some((root) => file.startsWith(root))) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found: " + path);
  }
}).listen(PORT, "127.0.0.1", () => console.log(JSON.stringify({ film: "macham", port: PORT })));
