// SultanC identifier rules, from the compiler's identifier policy registry
// (surface.json → identifier). Same rules as the lexer:
//   - a name starts with a start scalar and continues with start or rest scalars;
//   - ignored scalars (tatweel ـ) may appear inside a name and do not change it;
//   - normalized scalars (أ إ آ → ا) give one identity.

// Used until surface.json is loaded (ASCII + the Arabic block).
const FALLBACK = {
  start: [[0x41, 0x5a], [0x61, 0x7a], [0x5f, 0x5f], [0x621, 0x63a], [0x641, 0x64a], [0x671, 0x6d3]],
  rest: [[0x30, 0x39], [0x64b, 0x65f], [0x660, 0x669]],
  ignored: [0x640],
  normalized: [[0x622, 0x627], [0x623, 0x627], [0x625, 0x627]],
};

export function identifierPolicy(spec = FALLBACK) {
  const inRanges = (ranges, c) => ranges.some(([a, b]) => c >= a && c <= b);
  const ignored = new Set(spec.ignored);
  const normalized = new Map(spec.normalized);
  const isStart = (ch) => { const c = ch.codePointAt(0); return inRanges(spec.start, c) || ignored.has(c); };
  const isRest = (ch) => { const c = ch.codePointAt(0); return inRanges(spec.start, c) || inRanges(spec.rest, c) || ignored.has(c); };
  // Identity key: drop ignored scalars, apply normalization.
  const identity = (word) => {
    let out = "";
    for (const ch of word) {
      const c = ch.codePointAt(0);
      if (ignored.has(c)) continue;
      out += String.fromCodePoint(normalized.get(c) ?? c);
    }
    return out;
  };
  return { isStart, isRest, identity };
}
