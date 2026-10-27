// Builds the film's soundtrack from nothing but ffmpeg: an original bed locked to
// the picture's beat grid, plus the cues declared in sfx-cues.json. No borrowed
// music and no generated-audio API — none is keyed on this machine.
//
//   node demo/sound.mjs --cues demo/sfx-cues.json --total 52.8 --bpm 100 --out demo/out/audio.wav
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const TOTAL = Number(arg("total", 52.8));
const BPM = Number(arg("bpm", 100));
const BEAT = 60 / BPM;
const SR = 44100;
const score = JSON.parse(readFileSync(arg("cues", join(HERE, "sfx-cues.json")), "utf8"));
const OUT = resolve(arg("out", join(HERE, "out", "audio.wav")));
const tmp = mkdtempSync(join(tmpdir(), "filmsound-"));

const ff = (args) =>
  new Promise((res, rej) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let e = "";
    p.stderr.on("data", (d) => (e += d));
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(e.slice(-4000)))));
  });
const probe = (args) =>
  new Promise((res) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let e = "";
    p.stderr.on("data", (d) => (e += d));
    p.on("close", () => res(e));
  });

// ---- voices: short, organic, transient at sample zero (no padded silence) --
const VOICES = {
  tap: ["-f", "lavfi", "-i", "anoisesrc=duration=0.07:color=pink:amplitude=0.55", "-af", "highpass=f=1700,afade=t=out:st=0:d=0.055"],
  key: ["-f", "lavfi", "-i", "anoisesrc=duration=0.05:color=white:amplitude=0.4", "-af", "bandpass=f=2600:w=2400,afade=t=out:st=0:d=0.04"],
  stamp: ["-f", "lavfi", "-i", "sine=frequency=72:duration=0.34", "-af", "afade=t=out:st=0.008:d=0.32,volume=1.5"],
  wipe: ["-f", "lavfi", "-i", "anoisesrc=duration=0.55:color=pink:amplitude=0.42", "-af", "lowpass=f=2600,afade=t=in:st=0:d=0.14,afade=t=out:st=0.24:d=0.3"],
  chime: ["-f", "lavfi", "-i", "sine=frequency=659:duration=0.7", "-f", "lavfi", "-i", "sine=frequency=988:duration=0.7", "-filter_complex", "[0]afade=t=out:st=0.02:d=0.5[a];[1]afade=t=in:st=0.06:d=0.05,afade=t=out:st=0.1:d=0.55[b];[a][b]amix=inputs=2:normalize=0,volume=1.2"],
  hit: ["-f", "lavfi", "-i", "sine=frequency=56:duration=0.7", "-f", "lavfi", "-i", "anoisesrc=duration=0.09:color=pink:amplitude=0.5", "-filter_complex", "[0]afade=t=out:st=0.01:d=0.6[a];[1]highpass=f=900,afade=t=out:st=0:d=0.07[b];[a][b]amix=inputs=2:normalize=0,volume=1.35"],
};
for (const [name, a] of Object.entries(VOICES)) {
  const f = join(tmp, name + ".wav");
  await ff([...a, "-ac", "1", f]);
  score.sounds = score.sounds || {};
  score.sounds[name] = { file: f, hit: 0 };
}

// ---- bed: a drone in three harmonic zones, an on-grid pulse, and hats ------
// Every layer runs the FULL runtime and is faded by envelope rather than
// concatenated, so the music cannot drift against the picture.
const zones = score.bed || [
  { notes: [164.81, 196.0, 246.94], in: 0, out: 19.2 },    // E minor — the ask
  { notes: [130.81, 164.81, 196.0], in: 17.0, out: 38.4 }, // C major — the bound
  { notes: [146.83, 174.61, 220.0], in: 36.0, out: TOTAL + 1 }, // D minor — lifts to the close
];
const inputs = [];
const graph = [];
zones.forEach((z, i) => {
  const expr = "(" + z.notes.map((f) => `sin(2*PI*${f}*t)`).join("+") + ")*0.052";
  inputs.push("-f", "lavfi", "-i", `aevalsrc=${expr}:d=${TOTAL}:s=${SR}`);
  const rise = Math.max(0.01, (z.out - z.in) * 0.18);
  const env =
    z.in <= 0
      ? `max(0\\,min(1\\,((${z.out})-t)/${rise}))`
      : `max(0\\,min(1\\,(t-${z.in})/${rise}))*max(0\\,min(1\\,((${z.out})-t)/${rise}))`;
  graph.push(`[${i}:a]lowpass=f=1500,tremolo=f=0.11:d=0.35,volume='${env}':eval=frame[z${i}]`);
});
const k = zones.length;
inputs.push("-f", "lavfi", "-i", `aevalsrc=0.5*sin(2*PI*62*t)*exp(-7.5*mod(t\\,${BEAT * 2})):d=${TOTAL}:s=${SR}`);
inputs.push("-f", "lavfi", "-i", `aevalsrc=0.13*(random(0)-0.5)*exp(-46*mod(t\\,${BEAT})):d=${TOTAL}:s=${SR}`);
graph.push(`[${k}:a]lowpass=f=180[pulse]`);
graph.push(`[${k + 1}:a]highpass=f=5200[hats]`);
graph.push(`${zones.map((_, i) => `[z${i}]`).join("")}[pulse][hats]amix=inputs=${k + 2}:duration=longest:normalize=0,alimiter=limit=0.75[bed]`);

// ---- cues ------------------------------------------------------------------
const cues = (score.cues || []).filter((c) => c.t >= 0 && c.t < TOTAL);
cues.forEach((c, i) => {
  const s = score.sounds[c.sound];
  if (!s || !existsSync(s.file)) throw new Error("unknown sound: " + c.sound);
  inputs.push("-i", s.file);
  const gain = Math.pow(10, (c.db ?? -16) / 20);
  const start = Math.max(0, Math.round((c.t - (s.hit || 0)) * 1000));
  graph.push(`[${k + 2 + i}:a]volume=${gain.toFixed(4)},adelay=${start}:all=1[c${i}]`);
});
graph.push(`[bed]${cues.map((_, i) => `[c${i}]`).join("")}amix=inputs=${cues.length + 1}:duration=first:normalize=0,alimiter=limit=0.62:attack=6:release=140,apad[mix]`);

const dry = join(tmp, "dry.wav");
await ff([...inputs, "-filter_complex", graph.join(";"), "-map", "[mix]", "-ac", "1", "-ar", String(SR), "-t", String(TOTAL), dry]);

// ---- master: -14 LUFS integrated, true peak at or under -1 dBFS ------------
const m = await probe(["-i", dry, "-af", "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"]);
let j = {};
try { j = JSON.parse(m.slice(m.indexOf("{"), m.lastIndexOf("}") + 1)) || {}; } catch {}
const num = (v, d) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? d : String(v));
if (!Number.isFinite(Number(j.input_i))) {
  // No usable measurement: fall back to single-pass dynamic loudnorm rather than
  // feeding loudnorm an "undefined" number, which aborts the encode.
  await ff(["-i", dry, "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", String(SR), "-ac", "2", "-t", String(TOTAL), OUT]);
  j = { input_i: "single-pass" };
} else {
  const apply = `loudnorm=I=-14:TP=-1.5:LRA=9:linear=true:measured_I=${num(j.input_i, "-14")}:measured_TP=${num(j.input_tp, "-1.5")}:measured_LRA=${num(j.input_lra, "9")}:measured_thresh=${num(j.input_thresh, "-26")}:offset=${num(j.target_lowpass, "0")}:print_format=summary`;
  await ff(["-i", dry, "-af", apply, "-ar", String(SR), "-ac", "2", "-t", String(TOTAL), OUT]);
}
const after = await probe(["-i", OUT, "-af", "ebur128=framelog=quiet,volumedetect", "-f", "null", "-"]);
const i3 = /I:\s+(-?[\d.]+)\s+LUFS/.exec(after);
const tp = /max_volume:\s+(-?[\d.]+)\s+dB/.exec(after);
console.log(JSON.stringify({ out: OUT, total: TOTAL, bpm: BPM, cues: cues.length, zones: zones.length, loudness: i3 && i3[1], peakDb: tp && tp[1], measured: { i: j.input_i, tp: j.input_tp } }));
