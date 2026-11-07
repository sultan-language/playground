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
// The compiler's canonical registries (the generated .sn and bootstrap files
// are produced from these).
const REGISTRY = "tools/generate/registry";
for (const f of ["token_registry.def", "type_registry.def", "identifier_policy_registry.def"]) {
  try { await stat(path.join(checkout, REGISTRY, f)); }
  catch { console.error(`gen-assets: ${REGISTRY}/${f} is missing from the SultanC checkout; the playground reads the keyword, type and identifier registries from there.`); process.exit(1); }
}
const tokenDef = await readFile(path.join(checkout, "tools/generate/registry/token_registry.def"), "utf8");
const typeDef = await readFile(path.join(checkout, "tools/generate/registry/type_registry.def"), "utf8");
const pairs = []; // [arabic, english]
const types = [], literals = []; // for highlighting; taken from the registries so renames follow
for (const m of tokenDef.matchAll(/SULTANC__KEYWORD__\(\w+,\s*"([^"]+)",\s*"([^"]+)"\)/g)) pairs.push([m[2], m[1]]);
for (const m of tokenDef.matchAll(/SULTANC__BOOL_KEYWORD__\("([^"]+)",\s*"([^"]+)"/g)) { pairs.push([m[2], m[1]]); literals.push(m[2], m[1]); }
for (const m of typeDef.matchAll(/SULTANC__TYPE_(?:BUILTIN|MACHINE)__\([^"]*"([^"]+)",\s*"([^"]+)"\)/g)) { pairs.push([m[1], m[2]]); types.push(m[1], m[2]); }
for (const m of typeDef.matchAll(/SULTANC__TYPE_CONTEXTUAL__\(\w+,\s*\w+,\s*"([^"]+)",\s*"([^"]+)"/g)) { pairs.push([m[1], m[2]]); types.push(m[1], m[2]); }
pairs.push(["الرئيسية", "main"]);
// Built-in constructors of the contextual result/option types
// (matched by name in compiler/frontend/types/type_semantic_shape_queries.sn).
pairs.push(["نتيجة.نجح", "result.ok"], ["نتيجة.خطأ", "result.err"]);
pairs.push(["اختياري.موجود", "option.some"], ["اختياري.لا_شيء", "option.none"]);
// Deprecated Arabic spellings (kept for one release by the compiler): they
// convert to English, and English converts back to the canonical spelling,
// because the canonical pairs above are registered first.
const english = new Map(pairs.map(([ar, en]) => [ar, en]));
for (const m of tokenDef.matchAll(/SULTANC__KEYWORD_DEPRECATED__\(\w+,\s*"([^"]+)",\s*"([^"]+)"\)/g)) {
  if (english.has(m[2])) { pairs.push([m[1], english.get(m[2])]); if (types.includes(m[2])) types.push(m[1]); }
}
for (const m of typeDef.matchAll(/SULTANC__TYPE_CONTEXTUAL_DEPRECATED__\((\w+),\s*"([^"]+)"\)/g)) {
  const canonical = typeDef.match(new RegExp(`SULTANC__TYPE_CONTEXTUAL__\\(${m[1]},\\s*\\w+,\\s*"([^"]+)",\\s*"([^"]+)"`));
  if (canonical) { pairs.push([m[2], canonical[2]]); types.push(m[2]); }
}
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
// Identifier policy (which scalars may start/continue a name, which are ignored
// or normalized for identity), so the editor reads names exactly as the lexer.
const policyDef = await readFile(path.join(checkout, "tools/generate/registry/identifier_policy_registry.def"), "utf8");
const hex = (x) => parseInt(x, 16);
const identifier = { start: [], rest: [], ignored: [], normalized: [] };
for (const m of policyDef.matchAll(/^SULTANC__IDENTIFIER_(START|REST)_(RANGE|SCALAR)__\(0x([0-9A-Fa-f]+)(?:,\s*0x([0-9A-Fa-f]+))?\)/gm)) {
  identifier[m[1].toLowerCase()].push([hex(m[3]), hex(m[4] || m[3])]);
}
for (const m of policyDef.matchAll(/^SULTANC__IDENTIFIER_IGNORED_SCALAR__\(0x([0-9A-Fa-f]+)\)/gm)) identifier.ignored.push(hex(m[1]));
for (const m of policyDef.matchAll(/^SULTANC__IDENTIFIER_NORMALIZED_SCALAR__\(0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)\)/gm)) identifier.normalized.push([hex(m[1]), hex(m[2])]);
if (!identifier.start.length) throw new Error("identifier_policy_registry.def: no identifier-start entries found");
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
