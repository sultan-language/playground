// SultanC syntax highlighting for CodeMirror (both surfaces). Keywords, types,
// literals and identifier rules all come from surface.json, which is generated
// from the compiler's registries, so renames in the compiler follow here.
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { identifierPolicy } from "./identifiers.js";

export function sultanLanguage(surface) {
  const policy = identifierPolicy(surface.identifier);
  const set = (words) => new Set(words.map(policy.identity));
  const types = set(surface.types || []);
  const atoms = set(surface.literals || []);
  const kw = set([...surface.keywords.ar, ...surface.keywords.en].filter((w) => !w.includes(".")));
  for (const w of [...types, ...atoms]) kw.delete(w);
  return StreamLanguage.define({
    name: "sultanc",
    token(stream) {
      if (stream.eatSpace()) return null;
      if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
      const ch = stream.peek();
      if (ch === '"' || ch === "«" || ch === "'") {
        const close = ch === "«" ? "»" : ch;
        stream.next();
        let escaped = false;
        while (!stream.eol()) {
          const c = stream.next();
          if (c === close && !escaped) break;
          escaped = !escaped && c === "\\";
        }
        return "string";
      }
      if (/[0-9٠-٩]/.test(ch)) { stream.match(/^[0-9٠-٩_xXa-fA-F.]+/); return "number"; }
      if (policy.isStart(ch)) {
        let word = "";
        while (!stream.eol() && policy.isRest(stream.peek())) word += stream.next();
        const id = policy.identity(word);
        if (atoms.has(id)) return "atom";
        if (types.has(id)) return "typeName";
        if (kw.has(id)) return "keyword";
        if (stream.peek() === "(") return "function";
        return "variableName";
      }
      stream.next();
      return "operator";
    },
    languageData: { commentTokens: { line: "//" } },
    tokenTable: { function: t.function(t.variableName) },
  });
}

export const sultanHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword, color: "var(--syn-keyword)", fontWeight: "600" },
  { tag: t.typeName, color: "var(--syn-type)" },
  { tag: t.atom, color: "var(--syn-atom)" },
  { tag: t.string, color: "var(--syn-string)" },
  { tag: t.number, color: "var(--syn-number)" },
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: t.function(t.variableName), color: "var(--syn-function)" },
  { tag: t.operator, color: "var(--syn-operator)" },
]));
