// Encodes the rendered frames, builds the soundtrack, muxes the master, verifies
// it against the film gate, and delivers the package to Desktop\DEMOS.
//
//   node demo/assemble.mjs --slug macham --fps 30 --total 52.8
import { mkdirSync, existsSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const SLUG = arg("slug", "macham");
const FPS = Number(arg("fps", 30));
const TOTAL = Number(arg("total", 52.8));
const FRAMES = resolve(arg("frames", join(HERE, "out", "frames")));
const OUT = resolve(arg("out", join(HERE, "out")));
const DELIVER = arg("deliver-to", join(homedir(), "Desktop", "DEMOS"));
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");

// ffmpeg/ffprobe write diagnostics to stderr and data to stdout; keep both.
const run = (args, label) =>
  new Promise((res, rej) => {
    const p = spawn(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res({ out, err }) : rej(new Error(label + " failed:\n" + (err || out).slice(-1500)))));
  });
const probeJson = async (file) => JSON.parse((await run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], "ffprobe")).out);

mkdirSync(OUT, { recursive: true });
const have = readdirSync(FRAMES).filter((f) => /^f\d{5}\.png$/.test(f)).length;
const want = Math.round(TOTAL * FPS) + 1;
if (have < want) throw new Error(`only ${have}/${want} frames rendered — finish the render first`);

const video = join(OUT, "video-silent.mp4");
if (!existsSync(video)) {
  console.log("encoding picture…");
  await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(FRAMES, "f%05d.png"),
    "-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video], "encode");
} else console.log("reusing encoded picture");

console.log("building soundtrack…");
const audio = join(OUT, "audio.wav");
await run(["node", join(HERE, "sound.mjs"), "--cues", join(HERE, "sfx-cues.json"), "--total", String(TOTAL),
  "--bpm", String(arg("bpm", 100)), "--out", audio], "sound");

const master = join(OUT, `${SLUG}-launch.mp4`);
console.log("muxing master…");
await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", master], "mux");

// ---- gate ------------------------------------------------------------------
const info = await probeJson(master);
const v = info.streams.find((s) => s.codec_type === "video");
const a = info.streams.find((s) => s.codec_type === "audio");
const dur = Number(info.format.duration);
const fpsM = /^(\d+)\/(\d+)$/.exec(v.r_frame_rate || "0/1");
const fpsV = fpsM ? Number(fpsM[1]) / Number(fpsM[2]) : 0;
const loud = (await run(["ffmpeg", "-i", master, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], "loudness")).err;
const iMatch = /I:\s+(-?[\d.]+)\s+LUFS/.exec(loud.slice(loud.lastIndexOf("Summary")));
const integrated = iMatch ? Number(iMatch[1]) : null;
// This build's ebur128 prints no true-peak line; loudnorm's input_tp is the EBU
// true-peak estimator, so measure with that instead of reporting a bogus null.
const tpMeasure = (await run(["ffmpeg", "-i", master, "-af", "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"], "truepeak")).err;
const tpJson = /(\{[\s\S]*\})/.exec(tpMeasure.slice(tpMeasure.lastIndexOf("\n{") + 1));
const truePeak = tpJson ? Number(JSON.parse(tpJson[1]).input_tp) : null;

// A slow camera push reads as "frozen" to a loose noise floor, so this measures
// pixel-identical runs only — the thing that actually breaks a film.
const framesLog = (await run(["ffmpeg", "-i", master, "-vf", "freezedetect=n=-80dB:d=1.2", "-map", "0:v:0", "-an", "-f", "null", "-"], "freezedetect")).err;
const blackLog = (await run(["ffmpeg", "-i", master, "-vf", "blackdetect=d=3:pix_th=0.00", "-an", "-f", "null", "-"], "blackdetect")).err;
const freeze = /freeze_start/.test(framesLog) ? framesLog.match(/freeze_start:[\s\d.:]+/g).slice(0, 3) : [];
const deadBlack = /black_start/.test(blackLog) ? blackLog.match(/black_start:[\s\d.:]+/g).slice(0, 3) : [];

const checks = {
  "runtime (demo cut 45-75s)": { ok: dur >= 45 && dur <= 75, value: dur.toFixed(2) + "s" },
  "height >= 1080": { ok: Number(v.height) >= 1080, value: `${v.width}x${v.height}` },
  "fps 24-60": { ok: fpsV >= 24 && fpsV <= 60, value: fpsV.toFixed(1) },
  "audio present": { ok: Boolean(a), value: a ? `${a.codec_name} ${a.sample_rate}Hz` : "none" },
  "loudness -20..-11 LUFS": { ok: integrated !== null && integrated >= -20 && integrated <= -11, value: integrated + " LUFS" },
  "true peak <= -1 dBFS": { ok: truePeak !== null && truePeak <= -1, value: truePeak + " dBFS" },
  "no still frame > 1.2s": { ok: freeze.length === 0, value: freeze.length ? freeze.join(" ") : "clean" },
  "no dead-black gap > 3s": { ok: deadBlack.length === 0, value: deadBlack.length ? deadBlack.join(" ") : "clean" },
};
const pass = Object.values(checks).every((c) => c.ok);

// ---- deliver ---------------------------------------------------------------
const dir = join(DELIVER, `${SLUG}-${stamp}`);
for (const sub of ["16x9", "frames"]) mkdirSync(join(dir, sub), { recursive: true });
copyFileSync(master, join(dir, "16x9", `${SLUG}-launch.mp4`));
await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", master, "-vf", `fps=1/${(TOTAL / 12).toFixed(3)},scale=480:-1,tile=4x3`, "-frames:v", "1", join(dir, "frames", "contact-sheet.png")], "contact sheet");
for (const f of ["STORYBOARD.md", join("design-system", "frame.md"), "NOTES.md"]) {
  const src = join(HERE, f);
  if (existsSync(src)) copyFileSync(src, join(dir, f.replace(/\\/g, "-").replace(/\//g, "-")));
}
writeFileSync(join(dir, "manifest.json"), JSON.stringify({
  slug: SLUG, kind: "demo-cut", generated: new Date().toISOString(), source: HERE,
  runtime: Number(dur.toFixed(3)), fps: fpsV, resolution: `${v.width}x${v.height}`,
  video: { codec: v.codec_name, pix_fmt: v.pix_fmt, bitrate: Number(info.format.bit_rate) },
  audio: a && { codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels },
  loudness: { integratedLUFS: integrated, truePeakDbFS: truePeak },
  gate: { pass, checks },
  frames: have,
}, null, 2));

for (const [k, c] of Object.entries(checks)) console.log(`${c.ok ? "PASS" : "FAIL"}  ${k.padEnd(28)} ${c.value}`);
console.log(pass ? `\nDELIVERED ${join(dir, "16x9", SLUG + "-launch.mp4")}` : `\nNOT DELIVERED — gate failed (files staged in ${dir})`);
process.exit(pass ? 0 : 1);
