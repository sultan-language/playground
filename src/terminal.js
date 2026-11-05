// The Terminal panel: what a SultanC session in a shell would show for the job
// that just ran. It prints the command, the compiler's diagnostics (rendered
// from the structured JSON, like the compiler's own human format), progress
// lines, the program's output and its exit status.
//
// Snippets mark the span by highlighting it in the source line instead of a
// caret line, so Arabic (right-to-left) code is marked correctly too.

function node(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createTerminal(root) {
  let atBottom = true;
  root.addEventListener("scroll", () => {
    atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
  });
  const push = (line) => {
    root.appendChild(line);
    if (atBottom) root.scrollTop = root.scrollHeight;
    return line;
  };
  const line = (cls, text) => push(node("div", "t-line " + cls, text));

  return {
    clear() { root.textContent = ""; atBottom = true; },

    // $ sultanc --lang=en main.sn --target=wasm32-wasi -o build/program.wasm
    command(argv) {
      const l = node("div", "t-line t-command");
      l.append(node("span", "t-prompt", "$ "), node("span", "", argv.join(" ")));
      return push(l);
    },

    // A progress or result line: "   Compiling main.sn", "    Finished …".
    step(verb, rest, kind = "") {
      const l = node("div", "t-line t-step " + kind);
      l.append(node("span", "t-verb", verb.padStart(12, " ")), node("span", "", " " + rest));
      return push(l);
    },

    stdout(text) { return line("t-stdout", text); },
    stderr(text) { return line("t-stderr", text); },
    note(text) { return line("t-note", text); },

    // One compiler diagnostic (JSON schema 2). `source` maps a span to its
    // line text and character range when the file is the edited one.
    diagnostic(d, { severity, labels, locate }) {
      const block = node("div", "t-diag t-" + severity);
      const head = node("div", "t-line");
      head.append(
        node("span", "t-sev", `${labels.severity[severity] || severity}[${d.id}]`),
        node("span", "t-msg", ": " + d.message),
      );
      block.appendChild(head);
      const span = d.primary_span;
      if (span) {
        const where = node("div", "t-line t-where");
        where.append(node("span", "t-gutter", "  --> "), node("span", "t-path", `${span.file}:${span.line}:${span.column}`));
        block.appendChild(where);
        const at = locate(span);
        const text = at ? at.text : span.snippet;
        if (text !== undefined && text !== null) {
          const num = String(span.line);
          const pad = " ".repeat(num.length);
          block.appendChild(node("div", "t-line t-gutter", ` ${pad} |`));
          const src = node("div", "t-line t-src");
          src.appendChild(node("span", "t-gutter", ` ${num} | `));
          const code = node("span", "t-code");
          code.dir = "auto";
          if (at && at.to > at.from) {
            code.append(text.slice(0, at.from), node("mark", "t-mark", text.slice(at.from, at.to)), text.slice(at.to));
          } else {
            code.textContent = text;
          }
          src.appendChild(code);
          block.appendChild(src);
          if (d.primary_label) {
            const lab = node("div", "t-line");
            lab.append(node("span", "t-gutter", ` ${pad} | `), node("span", "t-label", d.primary_label));
            block.appendChild(lab);
          }
        }
      }
      for (const n of d.notes || []) block.appendChild(node("div", "t-line t-sub", `   = ${labels.note}: ${n}`));
      for (const h of d.help || []) block.appendChild(node("div", "t-line t-sub t-help", `   = ${labels.help}: ${h}`));
      for (const r of d.related_spans || []) {
        if (r.span) block.appendChild(node("div", "t-line t-sub", `   = ${r.label || r.role}: ${r.span.file}:${r.span.line}:${r.span.column}`));
      }
      return push(block);
    },

    text() { return root.innerText; },
  };
}
