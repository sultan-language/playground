// Downloads the playground compiler from a SultanC GitHub release and
// generates compiler/assets/ from it.
//
//   node scripts/fetch-compiler.mjs [tag]
//
// The release comes from compiler/release.json ("latest" or a tag); a tag on the
// command line (or SULTANC_RELEASE) overrides it. Steps:
//   1. download <asset> and <asset>.sha256 from the release, check the hash;
//   2. clone the same tag of the compiler repository (std, examples, token
//      registry) into compiler/cache/;
//   3. run gen-assets.mjs, which writes compiler/assets/.
// GITHUB_TOKEN is used when set (higher API rate limit). GITHUB_API_URL and
// GITHUB_SERVER_URL are honored as in GitHub Actions.
import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { CACHE, RELEASE } from "./paths.mjs";

const config = JSON.parse(await readFile(RELEASE, "utf8"));
const repo = config.repository;
const wanted = process.argv[2] || process.env.SULTANC_RELEASE || config.release || "latest";
const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
const server = (process.env.GITHUB_SERVER_URL || "https://github.com").replace(/\/$/, "");
const headers = { Accept: "application/vnd.github+json", "User-Agent": "sultanc-playground-build" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const fail = (msg) => { console.error(`fetch-compiler: ${msg}`); process.exit(1); };

async function get(url, accept) {
  const r = await fetch(url, { headers: accept ? { ...headers, Accept: accept } : headers });
  if (!r.ok) fail(`${url}: HTTP ${r.status}`);
  return r;
}

// 1. Release and assets.
const releaseUrl = wanted === "latest" ? `${api}/repos/${repo}/releases/latest` : `${api}/repos/${repo}/releases/tags/${encodeURIComponent(wanted)}`;
const release = await (await get(releaseUrl)).json();
const tag = release.tag_name;
const asset = release.assets.find((a) => a.name === config.asset);
const sumAsset = release.assets.find((a) => a.name === config.asset + ".sha256");
if (!asset || !sumAsset) {
  fail(`release ${tag} of ${repo} has no ${config.asset} (+ .sha256). ` +
    `Run the "Playground Compiler" workflow in ${repo} for that tag first.`);
}
const download = async (a) => Buffer.from(await (await get(a.url, "application/octet-stream")).arrayBuffer());
const wasm = await download(asset);
const expected = (await download(sumAsset)).toString("utf8").trim().split(/\s+/)[0];
const actual = createHash("sha256").update(wasm).digest("hex");
if (expected !== actual) fail(`SHA-256 mismatch for ${config.asset}: release says ${expected}, got ${actual}`);
console.log(`compiler ${tag}: ${wasm.length} bytes, sha256 ${actual}`);

// 2. Sources at the same tag.
const cacheDir = path.resolve(CACHE);
const checkout = path.join(cacheDir, `sultanc-${tag.replace(/[^\w.-]/g, "_")}`);
const exists = await access(checkout).then(() => true, () => false);
if (!exists) {
  await mkdir(cacheDir, { recursive: true });
  execFileSync("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", tag, `${server}/${repo}.git`, checkout], { stdio: "inherit" });
}
const wasmPath = path.join(cacheDir, `${config.asset}`);
await writeFile(wasmPath, wasm);

// 3. Assets.
execFileSync(process.execPath, ["scripts/gen-assets.mjs", checkout, wasmPath, tag], { stdio: "inherit" });
await rm(wasmPath, { force: true });
