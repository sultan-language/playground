// Generates compiler/assets/* from a SultanC checkout and a wasm32-wasi compiler build.
//
//   node scripts/gen-assets.mjs <sultanc-checkout> <sultanc.wasm> [version-label]
//
// Outputs:
//   compiler/assets/sultanc.wasm      the compiler (wasm32-wasi)
//   compiler/assets/std.json          library/** as { "path": "text" }
//   compiler/assets/examples.json     examples/{ar,en}/** as { "path": "text" } plus an index
//   compiler/assets/surface.json      Arabic <-> English token map (keywords, types, std aliases)
//   compiler/assets/version.json      compiler version label and hashes
import { readFile, readdir, stat, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readRegistry } from "./registry.mjs";
import { ASSETS } from "./paths.mjs";

const [checkout, compilerWasm, label = "dev"] = process.argv.slice(2);
if (!checkout || !compilerWasm) {
  console.error("usage: node scripts/gen-assets.mjs <sultanc-checkout> <sultanc.wasm> [version-label]");
  process.exit(2);
}
const out = path.resolve(ASSETS);
await mkdir(out, { recursive: true });

async function walk(dir, base, filter, acc = {}) {
  for (const name of (await readdir(dir)).sort()) {
    const p = path.join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) await walk(p, base, filter, acc);
    else if (filter(name)) acc[path.relative(base, p).split(path.sep).join("/")] = await readFile(p, "utf8");
  }
  return acc;
}

// 1. Compiler.
await copyFile(compilerWasm, path.join(out, "sultanc.wasm"));
const wasmHash = createHash("sha256").update(await readFile(compilerWasm)).digest("hex");

// 2. Standard library (mounted at library/ in the in-memory filesystem).
const std = await walk(path.join(checkout, "library"), checkout, (n) => n.endsWith(".sn") || n === "Supax.toml");
await writeFile(path.join(out, "std.json"), JSON.stringify(std));

// 3. Examples (mounted at examples/ so their relative imports keep working).
const examples = await walk(path.join(checkout, "examples"), checkout, (n) => n.endsWith(".sn"));
const index = Object.keys(examples)
  .filter((p) => /^examples\/(ar|en)\//.test(p))
  .map((p) => {
    const [, lang, ...rest] = p.split("/");
    const text = examples[p];
    const first = text.split("\n")[0];
    const summary = first.startsWith("//") ? first.replace(/^\/\/\s?/, "") : "";
    const hasEntry = /^\s*(عرف|def)\s+(الرئيسية|main)\s*\(/m.test(text);
    return { path: p, lang, id: rest.join("/"), summary, entry: hasEntry };
  });
await writeFile(path.join(out, "examples.json"), JSON.stringify({ files: examples, index }));

// 4. Surface map: keywords, built-in types, contextual types, std aliases, entry point.
// Keywords, types, literals and identifier rules from the compiler's sources.
const registry = await readRegistry(checkout);
const pairs = [...registry.pairs]; // [arabic, english]; canonical spellings first
const { types, literals } = registry;
pairs.push(["الرئيسية", "main"]);
// Built-in constructors of the contextual result/option types
// (matched by name in compiler/frontend/types/type_semantic_shape_queries.sn).
pairs.push(["نتيجة.نجح", "result.ok"], ["نتيجة.خطأ", "result.err"]);
pairs.push(["اختياري.موجود", "option.some"], ["اختياري.لا_شيء", "option.none"]);
// Deprecated Arabic spellings (accepted by the compiler for one release): they
// convert to English, and English converts back to the canonical spelling,
// because the canonical pairs above are registered first.
pairs.push(...registry.deprecatedPairs);
pairs.push(["اختيار.بعض", "option.some"], ["اختياري.بعض", "option.some"], ["اختيار.لا_شيء", "option.none"]);
// Built-in primitives (compiler/frontend/names/primitive_registry.sn).
const prim = await readFile(path.join(checkout, "compiler/frontend/names/primitive_registry.sn"), "utf8");
for (const m of prim.matchAll(/سجل_بدائيا_واحدا\([^«]*«([^»]+)»,\s*«([^»]+)»/g)) if (m[1] !== m[2]) pairs.push([m[1], m[2]]);
const keywords = new Set(pairs.map((p) => p[0]).concat(pairs.map((p) => p[1])));
// std aliases:  عام مرادف english_name = الاسم_العربي;   (dotted variant aliases too)
// Each alias is kept with its module ("std.text.transform"), because several
// modules export the same English name for different Arabic names (e.g. join).
const aliasPairs = [];
for (const [file, text] of Object.entries(std)) {
  if (!file.endsWith(".sn")) continue;
  const module = file.replace(/^library\//, "").replace(/\.sn$/, "").split("/").join(".");
  for (const m of text.matchAll(/^\s*عام\s+مرادف\s+([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*([^\s;<]+)\s*;/gm)) {
    aliasPairs.push([m[2], m[1], module]);
  }
}
// Identifier policy: the editor reads names exactly as the lexer does.
const { identifier } = registry;
const keywordList = {
  ar: [...new Set(pairs.map((p) => p[0]))],
  en: [...new Set(pairs.map((p) => p[1]))],
};
await writeFile(path.join(out, "surface.json"), JSON.stringify({ pairs, aliases: aliasPairs, keywords: keywordList, types, literals, identifier }));

// 5. Version.
await writeFile(path.join(out, "version.json"), JSON.stringify({
  compiler: label,
  compiler_sha256: wasmHash,
  generated: new Date().toISOString().slice(0, 10),
  std_files: Object.keys(std).length,
  examples: index.length,
}, null, 2));

console.log(`assets: compiler ${(await stat(compilerWasm)).size} bytes, std ${Object.keys(std).length} files, ` +
  `examples ${index.length}, keyword pairs ${pairs.length}, std aliases ${aliasPairs.length}`);
void keywords;
