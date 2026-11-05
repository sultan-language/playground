// SultanC Playground — UI.
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState, StateEffect, EditorSelection } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { setDiagnostics, lintGutter } from "@codemirror/lint";
import { sultanLanguage, sultanHighlight } from "./highlight.js";
import { buildMaps, convert, detectSurface } from "./surface.js";
import { createTerminal } from "./terminal.js";

const BASE = new URL(".", document.baseURI).href;

// ---------- UI text (Arabic default, English) ----------
const TEXT = {
  ar: {
    title: "ملعب سلطان سي",
    run: "تشغيل", build: "بناء وتنزيل", check: "فحص", share: "مشاركة", examples: "أمثلة", newFile: "ملف جديد",
    termClear: "مسح", termCopy: "نسخ",
    chooseExample: "اختر مثالا", download: "تنزيل الملف", theme: "المظهر", shortcuts: "الاختصارات",
    themes: { system: "مظهر النظام", dark: "داكن", light: "فاتح" },
    helpTitle: "اختصارات لوحة المفاتيح", close: "إغلاق",
    helpNote: "الشيفرة تُحفظ في متصفحك تلقائيا. رابط المشاركة يحمل الشيفرة نفسها ولا يُخزَّن شيء على خادم.",
    keys: [["تشغيل أو بناء", "Mod+Enter"], ["فحص", "Shift+Mod+Enter"], ["مشاركة", "Mod+S"], ["هذه القائمة", "?"]],
    draftRestored: "استُعيدت مسودتك الأخيرة.",
    term: {
      severity: { error: "خطأ", warning: "تحذير", info: "ملاحظة" }, note: "ملاحظة", help: "مساعدة",
      compiling: "يترجم", checking: "يفحص", interpreting: "يفسّر", finished: "اكتمل", running: "يشغّل", built: "بُني",
      exited: "انتهى", failed: "فشل", stopped: "أوقف",
      targetOf: (t) => `للهدف ${t}`, withCode: (c) => `بالرمز ${c}`, inMs: (ms) => `في ${ms} مللي ثانية`,
      noErrors: "بلا أخطاء", downloaded: (n) => `نُزِّل باسم ${n}`, clear: "مسح", copy: "نسخ", copied: "نُسخ",
    },
    code: "الشيفرة", messages: "الرسائل", target: "الهدف", input: "الإدخال (stdin)", output: "الطرفية", problems: "المشكلات",
    mode: "النمط", modeCompile: "المترجم", modeInterpret: "المفسر",
    targetBrowser: "المتصفح", targetInterp: "المتصفح · المفسر", targetMac: "macOS · Apple silicon", targetLinux: "Linux · x86-64",
    loading: "جارٍ تحميل المترجم…", ready: "جاهز", compiling: "يترجم…", running: "يعمل…",
    compiledIn: (ms, kb) => `تُرجم في ${ms} مللي ثانية (${kb} ك.ب)`,
    exit: (c, ms, cms) => `تُرجم في ${cms} مللي ثانية · عمل البرنامج ${ms} مللي ثانية وانتهى بالرمز ${c}`,
    interpreted: (c, ms) => `فسّر المفسر البرنامج وانتهى بالرمز ${c} بعد ${ms} مللي ثانية`,
    checkOk: (ms) => `لا أخطاء (${ms} مللي ثانية)`,
    built: (name, kb) => `بُني ${name} (${kb} ك.ب)`,
    compileFailed: "فشلت الترجمة", interpretFailed: "توقف المفسر بخطأ",
    count: (e, w) => [e && `${e} خطأ`, w && `${w} تحذير`].filter(Boolean).join("، "),
    noProblems: "لا مشكلات.",
    explain: "شرح", applyFix: "طبّق الإصلاح", note: "ملاحظة", help: "مساعدة", inFile: "في",
    copied: "نُسخ الرابط", timeout: (sec) => `توقف البرنامج: تجاوز المهلة (${sec} ثانية)`,
    switchNote: "تغيّرت الكلمات المفتاحية وأسماء المكتبة القياسية؛ أسماؤك بقيت كما كتبتها.",
    limits: "يعمل كل شيء داخل متصفحك. لا شبكة ولا عمليات فرعية ولا ملفات دائمة.",
    inputPlaceholder: "نص يُمرَّر إلى البرنامج عبر stdin",
    version: "المترجم",
    runNative: {
      "arm64-darwin": (f) => `للتشغيل على Mac:  chmod +x ${f} && xattr -d com.apple.quarantine ${f} && ./${f}`,
      "x86_64-linux": (f) => `للتشغيل على Linux:  chmod +x ${f} && ./${f}`,
    },
  },
  en: {
    title: "SultanC Playground",
    run: "Run", build: "Build & download", check: "Check", share: "Share", examples: "Examples", newFile: "New file",
    termClear: "Clear", termCopy: "Copy",
    chooseExample: "Choose an example", download: "Download file", theme: "Theme", shortcuts: "Shortcuts",
    themes: { system: "System theme", dark: "Dark", light: "Light" },
    helpTitle: "Keyboard shortcuts", close: "Close",
    helpNote: "Your code is saved in this browser as you type. A share link carries the code itself; nothing is stored on a server.",
    keys: [["Run or build", "Mod+Enter"], ["Check", "Shift+Mod+Enter"], ["Share", "Mod+S"], ["This list", "?"]],
    draftRestored: "Your last draft was restored.",
    term: {
      severity: { error: "error", warning: "warning", info: "note" }, note: "note", help: "help",
      compiling: "Compiling", checking: "Checking", interpreting: "Interpreting", finished: "Finished", running: "Running", built: "Built",
      exited: "Exited", failed: "Failed", stopped: "Stopped",
      targetOf: (t) => `for ${t}`, withCode: (c) => `with code ${c}`, inMs: (ms) => `in ${ms} ms`,
      noErrors: "no errors", downloaded: (n) => `downloaded as ${n}`, clear: "Clear", copy: "Copy", copied: "Copied",
    },
    code: "Code", messages: "Messages", target: "Target", input: "Input (stdin)", output: "Terminal", problems: "Problems",
    mode: "Mode", modeCompile: "Compiler", modeInterpret: "Interpreter",
    targetBrowser: "Browser", targetInterp: "Browser · interpreter", targetMac: "macOS · Apple silicon", targetLinux: "Linux · x86-64",
    loading: "Loading the compiler…", ready: "Ready", compiling: "Compiling…", running: "Running…",
    compiledIn: (ms, kb) => `Compiled in ${ms} ms (${kb} KB)`,
    exit: (c, ms, cms) => `Compiled in ${cms} ms · ran for ${ms} ms, exit code ${c}`,
    interpreted: (c, ms) => `Interpreted; program exited with code ${c} after ${ms} ms`,
    checkOk: (ms) => `No errors (${ms} ms)`,
    built: (name, kb) => `Built ${name} (${kb} KB)`,
    compileFailed: "Compilation failed", interpretFailed: "The interpreter stopped with an error",
    count: (e, w) => [e && `${e} error${e > 1 ? "s" : ""}`, w && `${w} warning${w > 1 ? "s" : ""}`].filter(Boolean).join(", "),
    noProblems: "No problems.",
    explain: "Explain", applyFix: "Apply fix", note: "note", help: "help", inFile: "in",
    copied: "Link copied", timeout: (sec) => `Program stopped: time limit (${sec} s) exceeded`,
    switchNote: "Keywords and standard-library names changed; your own names stay as you wrote them.",
    limits: "Everything runs in your browser. No network, no child processes, no persistent files.",
    inputPlaceholder: "Text passed to the program on stdin",
    version: "Compiler",
    runNative: {
      "arm64-darwin": (f) => `To run on a Mac:  chmod +x ${f} && xattr -d com.apple.quarantine ${f} && ./${f}`,
      "x86_64-linux": (f) => `To run on Linux:  chmod +x ${f} && ./${f}`,
    },
  },
};
// browser: compile to wasm32-wasi and run; interpreter: `sultanc run` (the
// compiler's own interpreter); native targets: build and download.
const TARGETS = [["browser", "targetBrowser"], ["interpreter", "targetInterp"], ["arm64-darwin", "targetMac"], ["x86_64-linux", "targetLinux"]];
const RUNS_HERE = new Set(["browser", "interpreter"]);

const NEW_FILE = {
  ar: `استورد std.io.println;\n\nعرف القلعة(): عدد {\n    دع التحية: نص = "مرحبا بالعالم";\n    اطبع_سطر(التحية);\n    أرجع 0;\n}\n`,
  en: `import std.io.println;\n\ndef main(): int {\n    let greeting: string = "Hello, world";\n    println(greeting);\n    return 0;\n}\n`,
};

// ---------- state ----------
const state = {
  ui: navigator.language && navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en",
  surface: null,
  target: "browser",
  path: "main.sn",
  examples: null,
  maps: null,
  worker: null,
  ready: false,
  jobId: 0,
  timer: null,
  afterRestart: null,
  diagnostics: [],   // compiler diagnostics of the last job (JSON schema 2)
  docAtJob: "",      // source the diagnostics refer to
  explains: new Map(), // job id -> { el, text }
  tab: "output",
  action: null,
};
const $ = (id) => document.getElementById(id);

// ---------- editor ----------
const view = new EditorView({
  parent: $("editor"),
  state: EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(), lintGutter(), history(), drawSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(),
      keymap.of([
        { key: "Mod-Enter", run: () => { runJob(primaryAction()); return true; } },
        { key: "Shift-Mod-Enter", run: () => { runJob("check"); return true; } },
        { key: "Mod-s", run: () => { share(); return true; } },
        indentWithTab, ...defaultKeymap, ...historyKeymap,
      ]),
      EditorView.perLineTextDirection.of(true),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => { if (u.docChanged) onDocChanged(); }),
    ],
  }),
});
function setLanguage(surface) {
  view.dispatch({ effects: StateEffect.appendConfig.of([sultanLanguage(surface), sultanHighlight]) });
}
function getCode() { return view.state.doc.toString(); }
function setCode(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }

// ---------- diagnostics ----------
// The compiler reports UTF-8 byte offsets; CodeMirror uses UTF-16 positions.
function byteToPos(text, byte) {
  const bytes = new TextEncoder().encode(text);
  return new TextDecoder().decode(bytes.subarray(0, Math.min(byte, bytes.length))).length;
}
function spanRange(span, text) {
  if (!span || span.file !== state.path) return null;
  const from = byteToPos(text, span.start_byte);
  const to = Math.max(from, byteToPos(text, span.end_byte));
  return { from, to };
}
const severityOf = (d) => (d.severity === "warning" ? "warning" : d.severity === "note" || d.severity === "help" ? "info" : "error");

function fixEdits(fix, text) {
  const edits = (fix.edits && fix.edits.length ? fix.edits : [{ span: fix.span, replacement: fix.replacement }])
    .map((e) => ({ range: spanRange(e.span, text), insert: e.replacement ?? "" }));
  return edits.every((e) => e.range) ? edits.map((e) => ({ from: e.range.from, to: e.range.to, insert: e.insert })) : null;
}
function applyFix(fix) {
  if (getCode() !== state.docAtJob) return; // the code changed since the check
  const changes = fixEdits(fix, state.docAtJob);
  if (changes) { view.dispatch({ changes }); view.focus(); }
}

function showDiagnosticsInEditor() {
  const text = state.docAtJob;
  if (getCode() !== text) return;
  const list = [];
  for (const d of state.diagnostics) {
    const r = spanRange(d.primary_span, text);
    if (!r) continue;
    const extra = [...(d.notes || []), ...(d.help || [])];
    list.push({
      from: r.from, to: r.to === r.from ? Math.min(r.from + 1, view.state.doc.length) : r.to,
      severity: severityOf(d), source: d.id,
      message: d.message + (d.primary_label ? ` — ${d.primary_label}` : "") + (extra.length ? "\n" + extra.join("\n") : ""),
      actions: (d.fixes || []).filter((f) => fixEdits(f, text)).map((f) => ({
        name: f.message || TEXT[state.ui].applyFix, apply: () => applyFix(f),
      })),
    });
  }
  view.dispatch(setDiagnostics(view.state, list));
}
function clearDiagnostics() {
  state.diagnostics = [];
  view.dispatch(setDiagnostics(view.state, []));
  renderProblems();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function renderProblems() {
  const T = TEXT[state.ui];
  const box = $("problems");
  box.textContent = "";
  const errors = state.diagnostics.filter((d) => severityOf(d) === "error").length;
  const warnings = state.diagnostics.filter((d) => severityOf(d) === "warning").length;
  $("problem-count").textContent = state.diagnostics.length ? String(state.diagnostics.length) : "";
  if (!state.diagnostics.length) { box.appendChild(el("div", "out-system", T.noProblems)); return; }
  box.appendChild(el("div", "out-system", T.count(errors, warnings)));
  for (const d of state.diagnostics) {
    const item = el("div", "problem problem-" + severityOf(d));
    const head = el("div", "problem-head");
    const span = d.primary_span;
    const where = span ? `${span.file === state.path ? "" : span.file + ":"}${span.line}:${span.column}` : "";
    const loc = el("button", "problem-loc", where);
    loc.type = "button";
    loc.disabled = !span || span.file !== state.path;
    loc.onclick = () => {
      const r = spanRange(span, state.docAtJob);
      if (!r || getCode() !== state.docAtJob) return;
      view.dispatch({ selection: EditorSelection.range(r.from, r.to), scrollIntoView: true });
      view.focus();
    };
    head.append(loc, el("span", "problem-msg", d.message));
    item.appendChild(head);
    if (d.primary_label) item.appendChild(el("div", "problem-sub", d.primary_label));
    for (const n of d.notes || []) item.appendChild(el("div", "problem-sub", `${T.note}: ${n}`));
    for (const h of d.help || []) item.appendChild(el("div", "problem-sub", `${T.help}: ${h}`));
    for (const r of d.related_spans || []) {
      if (r.span) item.appendChild(el("div", "problem-sub", `${r.label || r.role} — ${r.span.file}:${r.span.line}:${r.span.column}`));
    }
    const actions = el("div", "problem-actions");
    const code = el("code", "problem-code", d.id);
    actions.appendChild(code);
    const explainBtn = el("button", "link", T.explain);
    explainBtn.type = "button";
    const explainBox = el("div", "problem-explain");
    explainBtn.onclick = () => explain(d.id, explainBox, explainBtn);
    actions.appendChild(explainBtn);
    for (const f of d.fixes || []) {
      if (!fixEdits(f, state.docAtJob)) continue;
      const b = el("button", "link", f.message || T.applyFix);
      b.type = "button";
      b.onclick = () => applyFix(f);
      actions.appendChild(b);
    }
    item.append(actions, explainBox);
    box.appendChild(item);
  }
}
function explain(code, box, button) {
  if (!state.ready || box.dataset.loaded) { box.hidden = !box.hidden; return; }
  const id = ++state.jobId;
  state.explains.set(id, { box, button, text: [] });
  button.disabled = true;
  state.worker.postMessage({ type: "job", id, action: "explain", code, lang: state.ui });
}

// ---------- terminal ----------
const term = createTerminal($("output"));
function clearOutput() { term.clear(); }
function appendOutput(stream, text) {
  if (stream === "stdout") return term.stdout(text);
  if (stream === "stderr") return term.stderr(text);
  return term.note(text);
}
// The edited file's line text and the span's character range in it.
function locateSpan(span) {
  if (!span || span.file !== state.path) return null;
  const text = state.docAtJob;
  const r = spanRange(span, text);
  if (!r) return null;
  const lineStart = text.lastIndexOf("\n", r.from - 1) + 1;
  let lineEnd = text.indexOf("\n", r.from);
  if (lineEnd < 0) lineEnd = text.length;
  return { text: text.slice(lineStart, lineEnd), from: r.from - lineStart, to: Math.min(r.to, lineEnd) - lineStart };
}
function printDiagnostic(d) {
  const T = TEXT[state.ui].term;
  term.diagnostic(d, { severity: severityOf(d), labels: T, locate: locateSpan });
}
const stepTarget = () => (state.target === "browser" || state.target === "interpreter" ? "wasm32-wasi" : state.target);
function status(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.dataset.kind = kind;
}
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $("output").hidden = tab !== "output";
  $("problems").hidden = tab !== "problems";
}

// ---------- worker ----------
function startWorker() {
  if (state.worker) state.worker.terminate();
  state.ready = false;
  setBusy(true);
  status(TEXT[state.ui].loading);
  const w = new Worker(BASE + "worker.js");
  w.onmessage = onWorkerMessage;
  w.postMessage({ type: "init", base: BASE });
  state.worker = w;
}
function onWorkerMessage(e) {
  const m = e.data;
  const T = TEXT[state.ui];
  if (m.type === "ready") {
    state.ready = true;
    setBusy(false);
    if (state.afterRestart) { status(state.afterRestart, "error"); state.afterRestart = null; }
    else status(T.ready);
    return;
  }
  if (m.type === "fatal") { status(m.error, "error"); return; }
  const ex = state.explains.get(m.id);
  if (ex) {
    if (m.type === "output") ex.text.push(m.text);
    else if (m.type === "done") {
      ex.box.textContent = ex.text.join("\n").trim();
      ex.box.dataset.loaded = "1";
      ex.button.disabled = false;
      state.explains.delete(m.id);
    }
    return;
  }
  if (m.id !== undefined && m.id !== state.jobId) return;
  const TT = T.term;
  if (m.type === "command") {
    term.command(m.argv);
    const file = state.path.split("/").pop();
    if (m.argv[0] === "./build/program.wasm") term.step(TT.running, "build/program.wasm");
    else if (state.action === "check") term.step(TT.checking, file);
    else if (state.action === "interpret") term.step(TT.interpreting, file);
    else term.step(TT.compiling, `${file} ${TT.targetOf(stepTarget())}`);
  } else if (m.type === "diagnostic") {
    state.diagnostics.push(m.diagnostic);
    printDiagnostic(m.diagnostic);
  } else if (m.type === "output") {
    if (m.stream === "compiler-err" || m.stream === "compiler-out") term.stderr(m.text);
    else if (m.stream === "system") term.note(m.text);
    else if (m.text !== "") (m.stream === "program-err" ? term.stderr : term.stdout)(m.text);
  } else if (m.type === "compiled") {
    term.step(TT.finished, `build/program.wasm (${Math.round(m.bytes / 1024)} KB) ${TT.inMs(Math.round(m.ms))}`, "t-ok");
    status(T.compiledIn(Math.round(m.ms), Math.round(m.bytes / 1024)) + " · " + T.running);
  } else if (m.type === "done") {
    clearTimeout(state.timer);
    setBusy(false);
    if (m.error) term.stderr(m.error);
    renderProblems();
    showDiagnosticsInEditor();
    const errors = state.diagnostics.filter((d) => severityOf(d) === "error").length;
    const warnings = state.diagnostics.length - errors;
    const ms = Math.round(m.ms);
    if (m.phase === "compile" || m.phase === "build") {
      if (m.code === 0) {
        if (m.phase === "compile") term.step(TT.finished, `${TT.noErrors}${warnings ? ", " + T.count(0, warnings) : ""} ${TT.inMs(ms)}`, "t-ok");
        else term.step(TT.finished, `build/program ${TT.targetOf(m.target)} ${TT.inMs(ms)}`, "t-ok");
      }
      else term.step(TT.failed, `${T.count(errors, warnings) || T.compileFailed} ${TT.inMs(ms)}`, "t-bad");
    } else if (m.phase === "interpret") {
      if (errors) term.step(TT.failed, `${T.count(errors, warnings)} ${TT.inMs(ms)}`, "t-bad");
      else term.step(TT.exited, `${TT.withCode(m.code)} ${TT.inMs(ms)}`, m.code === 0 ? "t-ok" : "t-bad");
    } else if (m.phase === "run") {
      term.step(TT.exited, `${TT.withCode(m.code)} ${TT.inMs(ms)}`, m.code === 0 ? "t-ok" : "t-bad");
    }
    if (m.phase === "compile") {
      if (m.code === 0) status(T.checkOk(Math.round(m.ms)), "ok");
      else status(T.compileFailed, "error");
    } else if (m.phase === "interpret") {
      const failed = state.diagnostics.some((d) => severityOf(d) === "error");
      if (failed) status(T.interpretFailed, "error");
      else status(T.interpreted(m.code, Math.round(m.ms)), m.code === 0 ? "ok" : "error");
    } else if (m.phase === "build") {
      const name = downloadName(m.target);
      download(m.bytes, name);
      term.step(TT.built, `${name} (${Math.round(m.bytes.length / 1024)} KB), ${TT.downloaded(name)}`, "t-ok");
      if (T.runNative[m.target]) term.note(T.runNative[m.target](name));
      status(T.built(name, Math.round(m.bytes.length / 1024)), "ok");
    } else {
      status(T.exit(m.code, Math.round(m.ms), Math.round(m.compileMs || 0)), m.code === 0 ? "ok" : "error");
    }
  }
}
function downloadName(target) {
  const base = state.path.split("/").pop().replace(/\.sn$/, "") || "program";
  const ascii = /^[\w.-]+$/.test(base) ? base : "program";
  return target === "wasm32-wasi" ? ascii + ".wasm" : ascii;
}
function download(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = el("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function setBusy(busy) {
  for (const id of ["run", "check"]) $(id).disabled = busy || !state.ready;
  document.body.classList.toggle("busy", busy);
}
const primaryAction = () => (state.target === "browser" ? "run" : state.target === "interpreter" ? "interpret" : "build");
function runJob(action) {
  if (!state.ready) return;
  clearOutput();
  clearDiagnostics();
  setTab("output");
  setBusy(true);
  const T = TEXT[state.ui];
  status(T.compiling);
  state.jobId++;
  state.action = action;
  state.docAtJob = getCode();
  state.worker.postMessage({
    type: "job", id: state.jobId, action, path: state.path, source: state.docAtJob,
    lang: state.ui, stdin: $("stdin").value, target: state.target,
  });
  clearTimeout(state.timer);
  const limit = action === "interpret" ? 30 : 10; // the interpreter also compiles, and runs slower
  state.timer = setTimeout(() => {
    term.step(TEXT[state.ui].term.stopped, TEXT[state.ui].timeout(limit), "t-bad");
    state.afterRestart = TEXT[state.ui].timeout(limit);
    startWorker(); // a stuck program can only be stopped by replacing the worker
  }, limit * 1000);
}

// ---------- surface switch ----------
function setSurface(target, { convertCode = true } = {}) {
  if (state.surface === target) return;
  if (convertCode && state.surface) {
    // Unedited example: load its real counterpart (translated identifiers too).
    const counterpart = examplePathFor(state.path, target);
    if (counterpart && state.examples.files[state.path] === getCode()) {
      state.path = counterpart;
      setCode(state.examples.files[counterpart]);
    } else {
      setCode(convert(getCode(), target, state.maps));
      appendNote(TEXT[state.ui].switchNote);
    }
    clearDiagnostics();
  }
  state.surface = target;
  document.querySelectorAll("[data-surface]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.surface === target)));
  $("editor").dir = target === "ar" ? "rtl" : "ltr";
  fillExamples();
}
function examplePathFor(path, lang) {
  const m = /^examples\/(ar|en)\/(.+)$/.exec(path);
  if (!m) return null;
  const p = `examples/${lang}/${m[2]}`;
  return state.examples.files[p] !== undefined ? p : null;
}
function appendNote(text) { clearOutput(); setTab("output"); appendOutput("system", text); }

// ---------- target ----------
// Mode: Compiler (compile with the chosen target) or Interpreter (`sultanc run`).
// Internally the interpreter is the target "interpreter".
function setMode(mode) {
  setTarget(mode === "interpret" ? "interpreter" : (state.compileTarget || "browser"));
}
function setTarget(target) {
  state.target = TARGETS.some(([t]) => t === target) ? target : "browser";
  if (state.target !== "interpreter") state.compileTarget = state.target;
  const interp = state.target === "interpreter";
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.mode === "interpret") === interp)));
  $("target-field").hidden = interp;
  $("target").value = interp ? state.compileTarget || "browser" : state.target;
  $("run").textContent = TEXT[state.ui][RUNS_HERE.has(state.target) ? "run" : "build"];
  $("stdin-box").hidden = !RUNS_HERE.has(state.target);
}
function fillTargets() {
  const sel = $("target");
  sel.textContent = "";
  for (const [value, key] of TARGETS) {
    if (value === "interpreter") continue; // chosen with the Mode switch
    const o = el("option", "", TEXT[state.ui][key]);
    o.value = value;
    sel.appendChild(o);
  }
  sel.value = state.target;
}

// ---------- UI language ----------
function setUi(lang) {
  state.ui = lang;
  const T = TEXT[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.title = T.title;
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = T[e.dataset.t]; });
  $("stdin").placeholder = T.inputPlaceholder;
  document.querySelectorAll("[data-ui]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ui === lang)));
  fillTargets();
  setTarget(state.target);
  fillExamples();
  renderProblems();
  setTitles();
  if (state.ready) status(T.ready);
}

// ---------- examples ----------
function fillExamples() {
  if (!state.examples) return;
  const sel = $("examples");
  const lang = state.surface || "en";
  sel.textContent = "";
  const head = el("option", "", TEXT[state.ui].chooseExample);
  head.value = "";
  sel.appendChild(head);
  const nf = el("option", "", TEXT[state.ui].newFile);
  nf.value = "__new__";
  sel.appendChild(nf);
  const groups = new Map();
  for (const item of state.examples.index) {
    if (item.lang !== lang || !item.entry) continue;
    const group = item.id.split("/")[0];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  for (const [group, items] of groups) {
    const og = document.createElement("optgroup");
    og.label = group;
    for (const item of items) {
      const o = el("option", "", item.id.replace(/\.sn$/, "").split("/").slice(1).join("/"));
      o.value = item.path;
      if (item.summary) o.title = item.summary;
      if (item.path === state.path) o.selected = true;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
}
function loadExample(path) {
  if (path === "__new__") { state.path = "main.sn"; setCode(NEW_FILE[state.surface]); }
  else { state.path = path; setCode(state.examples.files[path]); }
  clearOutput();
  clearDiagnostics();
}

// ---------- share links ----------
// #s=<code surface>&l=<messages>&t=<target>&p=<path>&c=<base64url(deflate-raw(code))>
// An unedited example is shared by path only (short link).
async function encodeShare() {
  const params = new URLSearchParams({ s: state.surface, l: state.ui });
  if (state.target !== "browser") params.set("t", state.target);
  params.set("p", state.path);
  if (state.examples.files[state.path] !== getCode()) {
    const bytes = new TextEncoder().encode(getCode());
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
    params.set("c", btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  }
  return "#" + params.toString();
}
async function decodeShare(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const c = params.get("c");
  const p = params.get("p") || "main.sn";
  const pick = (v, ok) => (ok.includes(v) ? v : null);
  let code = null;
  if (c) {
    const bin = atob(c.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    code = await new Response(ds).text();
  } else if (state.examples.files[p] !== undefined) {
    code = state.examples.files[p];
  }
  if (code === null) return null;
  return {
    code, path: p,
    surface: pick(params.get("s"), ["ar", "en"]),
    ui: pick(params.get("l"), ["ar", "en"]),
    target: pick(params.get("t"), TARGETS.map(([t]) => t)),
  };
}

// ---------- boot ----------
async function boot() {
  setUi(state.ui);
  setTab("output");
  const [surface, examples, version] = await Promise.all([
    fetch(BASE + "assets/surface.json").then((r) => r.json()),
    fetch(BASE + "assets/examples.json").then((r) => r.json()),
    fetch(BASE + "assets/version.json").then((r) => r.json()).catch(() => null),
  ]);
  state.maps = buildMaps(surface);
  state.examples = examples;
  setLanguage(surface);
  if (version) {
    const v = $("version");
    v.textContent = version.compiler;
    if (/^v?\d/.test(version.compiler)) v.closest("a")?.setAttribute("href", `https://github.com/sultan-language/sultanc/releases/tag/${version.compiler}`);
  }

  let shared = null;
  try { shared = location.hash ? await decodeShare(location.hash) : null; } catch { shared = null; }
  if (shared) {
    if (shared.ui && shared.ui !== state.ui) setUi(shared.ui);
    if (shared.target) setTarget(shared.target);
    state.path = /^[\w؀-ۿ./-]+\.sn$/.test(shared.path) && !shared.path.includes("..") ? shared.path : "main.sn";
    setCode(shared.code);
    setSurface(shared.surface || detectSurface(shared.code, state.maps), { convertCode: false });
  } else if (readDraft() && readDraft().code.trim() && readDraft().code !== examples.files[readDraft().path]) {
    const d = readDraft();
    state.path = /^[\w؀-ۿ./-]+\.sn$/.test(d.path) && !d.path.includes("..") ? d.path : "main.sn";
    setCode(d.code);
    setSurface(d.surface === "en" || d.surface === "ar" ? d.surface : detectSurface(d.code, state.maps), { convertCode: false });
    appendOutput("system", TEXT[state.ui].draftRestored);
  } else {
    const start = `examples/${state.ui}/basics/hello.sn`;
    setSurface(state.ui, { convertCode: false });
    if (examples.files[start] !== undefined) { state.path = start; setCode(examples.files[start]); }
    else { state.path = "main.sn"; setCode(NEW_FILE[state.ui]); }
  }
  fillExamples();
  renderProblems();
  updateFileHead();
  startWorker();
}

// ---------- file header and drafts ----------
// The draft (code, path, surface) is kept in localStorage so a reload keeps
// the work; storage can be unavailable (private mode), so every access is guarded.
const DRAFT_KEY = "sultanc-playground:draft";
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* unavailable */ } },
};
let draftTimer = null;
function isEdited() { return !state.examples || state.examples.files[state.path] !== getCode(); }
function updateFileHead() {
  $("file-name").textContent = state.path.replace(/^examples\/(ar|en)\//, "");
  $("file-dirty").hidden = !isEdited() || !state.path.startsWith("examples/");
}
function onDocChanged() {
  updateFileHead();
  if (!state.examples) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    store.set(DRAFT_KEY, JSON.stringify({ path: state.path, surface: state.surface, code: getCode() }));
  }, 400);
}
function readDraft() {
  try {
    const d = JSON.parse(store.get(DRAFT_KEY) || "null");
    return d && typeof d.code === "string" && typeof d.path === "string" ? d : null;
  } catch { return null; }
}

// ---------- theme: system, dark, light ----------
const THEMES = ["system", "dark", "light"];
function applyTheme(name) {
  state.theme = THEMES.includes(name) ? name : "system";
  if (state.theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = state.theme;
  $("theme").title = `${TEXT[state.ui].theme}: ${TEXT[state.ui].themes[state.theme]}`;
}

// ---------- resizable split ----------
const SPLIT_KEY = "sultanc-playground:split";
function setSplit(percent) {
  const p = Math.min(80, Math.max(25, percent));
  $("panes").style.setProperty("--split", p + "%");
  store.set(SPLIT_KEY, String(p));
}
function initSplitter() {
  const saved = Number(store.get(SPLIT_KEY));
  if (saved) setSplit(saved);
  const bar = $("splitter");
  const fromPointer = (x) => {
    const r = $("panes").getBoundingClientRect();
    const rtl = document.documentElement.dir === "rtl";
    setSplit(((rtl ? r.right - x : x - r.left) / r.width) * 100);
  };
  bar.addEventListener("pointerdown", (e) => {
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev) => fromPointer(ev.clientX);
    const up = () => { document.body.classList.remove("resizing"); bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const current = parseFloat(getComputedStyle($("panes")).getPropertyValue("--split")) || 58;
    const towardEditor = (e.key === "ArrowLeft") !== (document.documentElement.dir === "rtl");
    setSplit(current + (towardEditor ? -3 : 3));
    e.preventDefault();
  });
}

// ---------- help ----------
function fillHelp() {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const body = $("help-keys");
  body.textContent = "";
  for (const [what, keys] of TEXT[state.ui].keys) {
    const tr = el("tr");
    const kd = el("td");
    keys.split("+").forEach((k, i) => { if (i) kd.append(" + "); kd.appendChild(el("kbd", "", k === "Mod" ? mod : k)); });
    tr.append(el("td", "", what), kd);
    body.appendChild(tr);
  }
}
function setTitles() {
  document.querySelectorAll("[data-title]").forEach((b) => { b.title = TEXT[state.ui][b.dataset.title]; b.setAttribute("aria-label", b.title); });
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  $("run").title = `${mod}+Enter`;
  $("check").title = `Shift+${mod}+Enter`;
  applyTheme(state.theme);
}

function downloadSource() {
  const name = state.path.split("/").pop() || "main.sn";
  download(new TextEncoder().encode(getCode()), name, "text/plain;charset=utf-8");
}
async function share() {
  const hash = await encodeShare();
  window.history.replaceState(null, "", hash);
  try { await navigator.clipboard.writeText(location.href); status(TEXT[state.ui].copied, "ok"); }
  catch { status(location.href); }
}

// ---------- events ----------
$("run").onclick = () => runJob(primaryAction());
$("check").onclick = () => runJob("check");
$("target").onchange = (e) => setTarget(e.target.value);
document.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("examples").onchange = (e) => { if (e.target.value) loadExample(e.target.value); };
document.querySelectorAll("[data-surface]").forEach((b) => (b.onclick = () => setSurface(b.dataset.surface)));
document.querySelectorAll("[data-ui]").forEach((b) => (b.onclick = () => setUi(b.dataset.ui)));
document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
$("share").onclick = share;
$("term-clear").onclick = () => term.clear();
$("term-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(term.text()); status(TEXT[state.ui].term.copied, "ok"); } catch { /* clipboard unavailable */ }
};
$("download").onclick = downloadSource;
$("theme").onclick = () => { applyTheme(THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]); store.set("sultanc-playground:theme", state.theme); };
$("help").onclick = () => { fillHelp(); $("help-dialog").showModal(); };
document.addEventListener("keydown", (e) => {
  if (e.key === "?" && !e.target.closest?.(".cm-editor, input, textarea, select")) { fillHelp(); $("help-dialog").showModal(); }
});
if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");
state.theme = store.get("sultanc-playground:theme") || "system";
applyTheme(state.theme);
initSplitter();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register(BASE + "sw.js").catch(() => {});
}
boot().catch((e) => status(String(e), "error"));
window.__playground = { state, view, runJob, setSurface, setUi, setTarget, setMode, getCode, setCode };
