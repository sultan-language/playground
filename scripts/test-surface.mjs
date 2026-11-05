// Checks the Arabic/English switch: every example is converted to the other
// surface and must still compile (`sultanc check`). Run after gen-assets:
//   node scripts/test-surface.mjs [limit]
import { readFile } from "node:fs/promises";
import { WASI, File, Directory, PreopenDirectory, ConsoleStdout, OpenFile, WASIProcExit } from "@bjorn3/browser_wasi_shim";
import { buildMaps, convert } from "../src/surface.js";
import { ASSETS } from "./paths.mjs";

const enc = new TextEncoder();
const limit = Number(process.argv[2] || 1e9);
const std = JSON.parse(await readFile(`${ASSETS}/std.json`, "utf8"));
const ex = JSON.parse(await readFile(`${ASSETS}/examples.json`, "utf8"));
const maps = buildMaps(JSON.parse(await readFile(`${ASSETS}/surface.json`, "utf8")));
const mod = await WebAssembly.compile(await readFile(`${ASSETS}/sultanc.wasm`));

function tree(files, prefix) {
  const root = new Map();
  for (const [p, t] of Object.entries(files)) {
    if (!p.startsWith(prefix + "/")) continue;
    const parts = p.slice(prefix.length + 1).split("/");
    let d = root;
    for (const part of parts.slice(0, -1)) { if (!d.has(part)) d.set(part, new Directory(new Map())); d = d.get(part).contents; }
    d.set(parts.at(-1), new File(enc.encode(t)));
  }
  return new Directory(root);
}
const lib = tree(std, "library");

async function check(files, path) {
  const root = new Map([["library", lib], ["examples", tree(files, "examples")]]);
  let err = "";
  const fds = [new OpenFile(new File([])), ConsoleStdout.lineBuffered(() => {}), ConsoleStdout.lineBuffered((l) => (err += l + "\n")), new PreopenDirectory(".", root)];
  const w = new WASI(["sultanc", "--lang=en", "check", path], [], fds, { debug: false });
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w.wasiImport });
  let code;
  try { code = w.start(inst); } catch (e) { code = e instanceof WASIProcExit ? e.code : String(e); }
  return { code, err };
}

let ok = 0, bad = 0, baseBad = 0, n = 0;
const failures = [];
for (const item of ex.index) {
  if (!item.entry || n >= limit) continue;
  n++;
  const target = item.lang === "en" ? "ar" : "en";
  const base = await check(ex.files, item.path);
  if (base.code !== 0) { baseBad++; continue; } // example itself doesn't check; not a switch problem
  const files = { ...ex.files, [item.path]: convert(ex.files[item.path], target, maps) };
  const r = await check(files, item.path);
  if (r.code === 0) ok++;
  else { bad++; failures.push({ path: item.path, err: r.err.split("\n").slice(0, 2).join(" | ") }); }
}
console.log(`examples checked: ${n}; base failing: ${baseBad}; converted OK: ${ok}; converted failing: ${bad}`);
for (const f of failures) console.log("FAIL", f.path, "::", f.err);
