// Single-file build for double-click viewing. Classic script, no modules,
// so file:// opens it in any browser. Deploy artifact stays dist/.
// Run: node scripts/single.mjs (from Macham/site). Output: single.html.
import { buildSync } from "esbuild"
import { readFileSync, writeFileSync } from "node:fs"

const js = buildSync({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  loader: { ".css": "text" },
  write: false,
}).outputFiles[0].text

if (/^\s*import\s/m.test(js) || /export\s[{*]/m.test(js.slice(0, 200))) {
  throw new Error("Bundle leaked module syntax.")
}

const css = readFileSync("src/style.css", "utf8")
const tpl = readFileSync("index.html", "utf8")
  .replace(/<script type="module"[^>]*><\/script>/, "")
  .replace("</head>", "<style>\n" + css.replace(/<\/style>/g, "") + "\n</style>\n</head>")
const out = tpl.replace('<div id="app"></div>', '<div id="app"></div>\n<script>\n' + js.replace(/<\/script>/g, "<\\/script>") + "\n</script>")

writeFileSync("single.html", out)
console.log(JSON.stringify({ single_html_bytes: out.length }))
