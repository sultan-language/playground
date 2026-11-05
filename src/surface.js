// Switches SultanC source between its Arabic and English surfaces.
// Only language tokens change: keywords, built-in types and constructors, the
// entry point, and standard-library names that have an official English alias
// (مرادف). Strings, comments, module paths and the user's own names are left
// exactly as written.
//
// Names are compared by identifier identity, as the compiler does: tatweel is
// ignored and أ/إ/آ equal ا, so «إطبع» and «اطبع» are the same name.
import { identifierPolicy } from "./identifiers.js";

let policy = identifierPolicy();
const IMPORT_WORDS = { has: (w) => w === "import" || policy.identity(w) === "استورد" };
const FROM_WORDS = { has: (w) => w === "from" || policy.identity(w) === "من" };

// Map keyed by identity: get/has/set take spellings.
class NameMap {
  constructor() { this.m = new Map(); }
  key(name) { return name.split(".").map(policy.identity).join("."); }
  has(name) { return this.m.has(this.key(name)); }
  get(name) { return this.m.get(this.key(name)); }
  set(name, value) { this.m.set(this.key(name), value); return this; }
  [Symbol.iterator]() { return this.m[Symbol.iterator](); }
}

export function buildMaps(surface) {
  if (surface.identifier) policy = identifierPolicy(surface.identifier);
  const base = { toEn: new NameMap(), toAr: new NameMap() };
  for (const [ar, en] of surface.pairs) {
    if (!base.toEn.has(ar)) base.toEn.set(ar, en);
    if (!base.toAr.has(en)) base.toAr.set(en, ar);
  }
  // Aliases by module, plus a global table of names that are unambiguous.
  const byModule = new Map();
  const countEn = new Map(), countAr = new Map();
  for (const [ar, en, module] of surface.aliases) {
    if (!byModule.has(module)) byModule.set(module, []);
    byModule.get(module).push([ar, en]);
    countEn.set(en, (countEn.get(en) || new Set()).add(ar));
    countAr.set(ar, (countAr.get(ar) || new Set()).add(en));
  }
  const globalToEn = new NameMap(), globalToAr = new NameMap();
  for (const [ar, ens] of countAr) if (ens.size === 1) globalToEn.set(ar, [...ens][0]);
  for (const [en, ars] of countEn) if (ars.size === 1) globalToAr.set(en, [...ars][0]);
  // std variant aliases (dotted) are not accepted in patterns yet, so they keep
  // their canonical spelling inside match-arm patterns.
  const patternUnsafe = new NameMap();
  for (const [ar, en] of surface.aliases) if (en.includes(".")) { patternUnsafe.set(ar, true); patternUnsafe.set(en, true); }
  return { base, byModule, globalToEn, globalToAr, patternUnsafe, policy, toEn: base.toEn, toAr: base.toAr };
}

// Tokenizes into chunks: { kind: "ident" | "string" | "comment" | "space" | "other", text }.
export function tokenize(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const push = (kind, text) => out.push({ kind, text });
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      push("comment", src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "«" || c === "'") {
      const close = c === "«" ? "»" : c;
      let j = i + 1;
      while (j < n && src[j] !== close && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(n, j + 1);
      push("string", src.slice(i, j));
      i = j;
    } else if (policy.isStart(c)) {
      let j = i + 1;
      while (j < n && policy.isRest(src[j])) j++;
      push("ident", src.slice(i, j));
      i = j;
    } else if (/\s/.test(c)) {
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      push("space", src.slice(i, j));
      i = j;
    } else {
      push("other", c);
      i++;
    }
  }
  return out;
}

// Module paths this file imports: "import a.b.c;" -> a.b.c ; "from a.b import x, y;" -> a.b.* (prefix).
function importedModules(toks) {
  const exact = new Set(), prefixes = new Set();
  const sig = toks.filter((t) => t.kind !== "space" && t.kind !== "comment");
  for (let k = 0; k < sig.length; k++) {
    const w = sig[k].text;
    const isFrom = FROM_WORDS.has(w) && sig[k - 1] && (sig[k - 1].text === ";" || k === 0 || sig[k - 1].kind === "comment");
    if (!IMPORT_WORDS.has(w) && !isFrom) continue;
    let path = "";
    let j = k + 1;
    while (sig[j] && (sig[j].kind === "ident" || sig[j].text === ".")) { path += sig[j].text; j++; }
    if (!path) continue;
    if (isFrom) prefixes.add(path.replace(/^std\./, "std."));
    else exact.add(path);
  }
  return { exact, prefixes };
}

function mapsFor(src, target, maps, toks) {
  const map = new NameMap();
  for (const [k, v] of (target === "en" ? maps.base.toEn : maps.base.toAr)) map.m.set(k, v);
  const { exact, prefixes } = importedModules(toks);
  for (const [module, pairs] of maps.byModule) {
    const visible = exact.has(module) || [...exact].some((e) => module.startsWith(e + ".")) ||
      [...prefixes].some((p) => module === p || module.startsWith(p + "."));
    if (!visible) continue;
    for (const [ar, en] of pairs) {
      const [from, to] = target === "en" ? [ar, en] : [en, ar];
      if (!map.has(from)) map.set(from, to);
    }
  }
  const global = target === "en" ? maps.globalToEn : maps.globalToAr;
  for (const [from, to] of global) if (!map.m.has(from)) map.m.set(from, to);
  return map;
}

// Converts to "en" or "ar". Dotted names (e.g. json_value.null, result.ok) are
// matched greedily, longest first. A name right after "." is a member or
// variant and is only converted as part of a longer dotted match.
export function convert(src, target, maps) {
  const toks = tokenize(src);
  const map = mapsFor(src, target, maps, toks);
  const keywords = target === "en" ? maps.base.toEn : maps.base.toAr;
  const result = [];
  let importMode = null;  // null | "path" (kept as written) | "names" (after "from … import")
  let fromPending = false;
  let inPattern = false;  // between a match arm's "|" and its "->"
  let prevSig = null;     // previous non-space, non-comment token
  const nextSig = (k) => { for (let j = k + 1; j < toks.length; j++) if (toks[j].kind !== "space" && toks[j].kind !== "comment") return toks[j]; return null; };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.kind === "space" || t.kind === "comment") { result.push(t.text); continue; }
    if (t.kind !== "ident") {
      if (t.text === ";") { importMode = null; fromPending = false; inPattern = false; }
      else if (t.text === "|" && toks[k + 1]?.text !== "|" && toks[k - 1]?.text !== "|") inPattern = true;
      else if (t.text === ">" && toks[k - 1]?.text === "-") inPattern = false;
      else if (t.text === "{") inPattern = false;
      result.push(t.text);
      prevSig = t;
      continue;
    }
    const afterDot = prevSig && prevSig.text === ".";
    const statementStart = !prevSig || prevSig.text === ";" || prevSig.text === "}";
    prevSig = t;
    if (statementStart && FROM_WORDS.has(t.text)) {
      result.push(keywords.get(t.text) ?? t.text);
      importMode = "path";
      fromPending = true;
      continue;
    }
    if (IMPORT_WORDS.has(t.text) && (statementStart || fromPending)) {
      result.push(keywords.get(t.text) ?? t.text);
      importMode = fromPending ? "names" : "path";
      continue;
    }
    if (importMode === "path") {
      // Module paths stay as written; a standalone keyword (e.g. "as") still converts.
      const standalone = !afterDot && nextSig(k)?.text !== ".";
      result.push(standalone && keywords.has(t.text) ? keywords.get(t.text) : t.text);
      continue;
    }
    if (afterDot) { result.push(t.text); continue; }
    // In a pattern, a qualified name (Type.Variant) keeps its canonical spelling,
    // unless the whole chain is a built-in constructor such as result.ok.
    if (inPattern && nextSig(k)?.text === ".") {
      let chain = t.text, end = k, builtin = null;
      while (toks[end + 1] && toks[end + 1].text === "." && toks[end + 2] && toks[end + 2].kind === "ident") {
        chain += "." + toks[end + 2].text; end += 2;
        if (keywords.has(chain)) builtin = { text: keywords.get(chain), end };
      }
      if (builtin) { result.push(builtin.text); prevSig = toks[builtin.end]; k = builtin.end; }
      else { result.push(t.text); }
      continue;
    }
    // Longest dotted chain starting here: ident (. ident)*
    let best = null;
    let chain = t.text;
    let end = k;
    if (map.has(chain)) best = { text: map.get(chain), end };
    while (toks[end + 1] && toks[end + 1].text === "." && toks[end + 2] && toks[end + 2].kind === "ident") {
      chain += "." + toks[end + 2].text;
      end += 2;
      if (map.has(chain) && !(inPattern && maps.patternUnsafe.has(chain))) best = { text: map.get(chain), end };
    }
    if (best && inPattern && maps.patternUnsafe.has(toks.slice(k, best.end + 1).map((x) => x.text).join(""))) best = null;
    if (best) {
      result.push(best.text);
      if (best.end > k) prevSig = toks[best.end];
      k = best.end;
    } else {
      result.push(t.text);
    }
  }
  return result.join("");
}

// Guesses which surface a source is written in, from its language tokens.
export function detectSurface(src, maps) {
  let ar = 0, en = 0;
  for (const t of tokenize(src)) {
    if (t.kind !== "ident") continue;
    if (maps.base.toEn.has(t.text)) ar++;
    else if (maps.base.toAr.has(t.text)) en++;
  }
  return ar >= en ? "ar" : "en";
}
