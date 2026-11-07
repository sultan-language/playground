// Gets the playground compiler from the SultanC repository and generates
// compiler/assets/ from it.
//
//   node scripts/fetch-compiler.mjs [ref]
//
// The repository and ref (branch, tag or commit) come from
// compiler/source.json; a ref on the command line, or SULTANC_REF, overrides
// it. Steps:
//   1. shallow-clone that ref of the compiler repository into compiler/cache/;
//   2. decompress its wasm seed (bootstrap-wasm/seed/sultanc.wasm.zst), which
//      is the SultanC compiler built for wasm32-wasi;
//   3. run gen-assets.mjs on the same checkout (std, examples, registries),
//      which writes compiler/assets/.
// The compiler, the standard library and the examples therefore always come
// from one commit. GITHUB_SERVER_URL is honored as in GitHub Actions.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";
import path from "node:path";
import { CACHE, SOURCE } from "./paths.mjs";

const config = JSON.parse(await readFile(SOURCE, "utf8"));
const ref = process.argv[2] || process.env.SULTANC_REF || config.ref || "main";
const server = (process.env.GITHUB_SERVER_URL || "https://github.com").replace(/\/$/, "");
const url = `${server}/${config.repository}.git`;
const fail = (msg) => { console.error(`fetch-compiler: ${msg}`); process.exit(1); };
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

// 1. Checkout. A fresh shallow clone each time keeps the cache small and the
// result tied to exactly one commit.
const checkout = path.resolve(CACHE, "sultanc");
await rm(checkout, { recursive: true, force: true });
await mkdir(checkout, { recursive: true });
git(["init", "--quiet"], checkout);
git(["remote", "add", "origin", url], checkout);
try {
  git(["fetch", "--quiet", "--depth", "1", "origin", ref], checkout);
} catch {
  fail(`could not fetch ${ref} from ${url}`);
}
git(["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], checkout);
const commit = git(["rev-parse", "HEAD"], checkout);
console.log(`sultanc ${ref} @ ${commit.slice(0, 12)}`);

// 2. The wasm seed.
let compressed;
try { compressed = await readFile(path.join(checkout, config.seed)); }
catch { fail(`${config.seed} not found in ${config.repository}@${ref}`); }
let wasm;
if (typeof zlib.zstdDecompressSync === "function") {
  wasm = zlib.zstdDecompressSync(compressed);
} else {
  try { wasm = execFileSync("zstd", ["-d", "-c"], { input: compressed, maxBuffer: 1 << 30 }); }
  catch { fail("this Node.js has no zstd support and the `zstd` tool was not found; use Node.js 22.15 or later, or install zstd"); }
}
if (wasm.subarray(0, 4).toString("binary") !== "\0asm") fail(`${config.seed} did not decompress to a WebAssembly module`);
const wasmPath = path.resolve(CACHE, "sultanc.wasm");
await writeFile(wasmPath, wasm);

// 3. Assets, labelled with the ref and commit they came from.
const label = `${ref}@${commit.slice(0, 7)}`;
execFileSync(process.execPath, ["scripts/gen-assets.mjs", checkout, wasmPath, label], { stdio: "inherit" });
const versionPath = path.resolve("compiler/assets/version.json");
const version = JSON.parse(await readFile(versionPath, "utf8"));
Object.assign(version, { repository: config.repository, ref, commit });
await writeFile(versionPath, JSON.stringify(version, null, 2));
