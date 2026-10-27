// Demo-only bundler. Produces everything the film needs from the real sources;
// touches nothing outside demo/ and adds no dependency to the app's package.json.
//   node demo/build.mjs
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "build");
mkdirSync(OUT, { recursive: true });

const entry = resolve(HERE, "widget-entry.ts");
const common = {
  entryPoints: [entry],
  bundle: true,
  logLevel: "warning",
  legalComments: "none",
  target: ["es2020"],
};

// 1. The storefront bundle: what a merchant would paste, minus the CDN hop.
await build({
  ...common,
  format: "iife",
  globalName: "MachamFilm",
  platform: "browser",
  outfile: join(OUT, "macham-film.js"),
});

// 2. The same module graph as ESM, for demo/capture.mjs (real gateway calls).
await build({
  ...common,
  format: "esm",
  platform: "node",
  outfile: join(OUT, "film-core.mjs"),
});

console.log(JSON.stringify({ built: ["build/macham-film.js", "build/film-core.mjs"] }));
