// Compiles and runs SultanC entirely in the browser.
// The SultanC compiler (wasm32-wasi) runs under a WASI shim with an in-memory
// filesystem holding library/ (std), examples/ and the user's file. The program
// it produces (also wasm32-wasi) runs under a second shim instance.
import { WASI, File, Directory, PreopenDirectory, ConsoleStdout, OpenFile, WASIProcExit } from "@bjorn3/browser_wasi_shim";

const encoder = new TextEncoder();
let compilerModule = null;
let libraryDir = null;
let examplesDir = null;
const MAX_OUTPUT_LINES = 5000;

function treeFromFiles(files, prefix) {
  // files: { "library/std/io/print.sn": "text", ... } -> Directory rooted at prefix
  const root = new Map();
  for (const [p, text] of Object.entries(files)) {
    if (!p.startsWith(prefix + "/")) continue;
    const parts = p.slice(prefix.length + 1).split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.has(part)) dir.set(part, new Directory(new Map()));
      dir = dir.get(part).contents;
    }
    dir.set(parts[parts.length - 1], new File(encoder.encode(text), { readonly: true }));
  }
  return new Directory(root);
}

// Builds a fresh root for one compilation. Shared read-only trees are reused;
// only the directories along the user's file path are copied.
function makeRoot(userPath, source) {
  const root = new Map([["library", libraryDir], ["examples", examplesDir], ["build", new Directory(new Map())]]);
  const parts = userPath.split("/");
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    const existing = dir.get(part);
    const copy = new Directory(new Map(existing ? existing.contents : []));
    dir.set(part, copy);
    dir = copy.contents;
  }
  dir.set(parts[parts.length - 1], new File(encoder.encode(source)));
  return root;
}

function lineSink(stream, state) {
  return ConsoleStdout.lineBuffered((line) => {
    if (state.lines >= MAX_OUTPUT_LINES) {
      if (state.lines === MAX_OUTPUT_LINES) postMessage({ type: "output", stream: "system", text: "… output truncated" });
      state.lines++;
      return;
    }
    state.lines++;
    postMessage({ type: "output", stream, text: line });
  });
}

function runWasi(module, args, rootMap, stdinText, streamPrefix) {
  const state = { lines: 0 };
  const stdinBytes = encoder.encode(stdinText || "");
  const fds = [
    new OpenFile(new File(stdinBytes)),
    lineSink(streamPrefix + "out", state),
    lineSink(streamPrefix + "err", state),
    new PreopenDirectory(".", rootMap),
  ];
  const wasi = new WASI(args, [], fds, { debug: false });
  return WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport }).then((instance) => {
    let code;
    try {
      code = wasi.start(instance);
    } catch (e) {
      if (e instanceof WASIProcExit) code = e.code;
      else throw e;
    } finally {
      // Flush partial last lines.
      fds[1].write(encoder.encode("\n"));
      fds[2].write(encoder.encode("\n"));
    }
    return code;
  });
}

async function init({ base }) {
  const [mod, std, ex] = await Promise.all([
    WebAssembly.compileStreaming(fetch(base + "assets/sultanc.wasm")).catch(async () =>
      WebAssembly.compile(await (await fetch(base + "assets/sultanc.wasm")).arrayBuffer())),
    fetch(base + "assets/std.json").then((r) => r.json()),
    fetch(base + "assets/examples.json").then((r) => r.json()),
  ]);
  compilerModule = mod;
  libraryDir = treeFromFiles(std, "library");
  examplesDir = treeFromFiles(ex.files, "examples");
  postMessage({ type: "ready" });
}

// Native targets the playground can build for download (Native backend, no LLVM).
const NATIVE_TARGETS = new Set(["arm64-darwin", "x86_64-linux"]);

// Compiler stderr: with --diagnostic-format=json every diagnostic is one JSON
// line; anything else is passed through as text.
function diagnosticSink(state) {
  return ConsoleStdout.lineBuffered((line) => {
    if (line.startsWith("{")) {
      try { postMessage({ type: "diagnostic", id: state.id, diagnostic: JSON.parse(line) }); return; } catch { /* fall through */ }
    }
    if (line !== "") postMessage({ type: "output", id: state.id, stream: "compiler-err", text: line });
  });
}

// stdoutStream: where the compiler's stdout goes ("compiler-out", or
// "program-out" when the compiler runs the program in its interpreter).
// The command as a user would type it; the flags the playground adds for
// itself (JSON diagnostics, no color) are left out.
const shown = (args) => args.filter((a) => a !== "--color=never" && a !== "--diagnostic-format=json");

function runCompiler(args, root, id, { stdin = "", stdoutStream = "compiler-out" } = {}) {
  postMessage({ type: "command", id, argv: shown(args) });
  const state = { id };
  const out = { lines: 0 };
  const fds = [
    new OpenFile(new File(encoder.encode(stdin))),
    stdoutStream === "program-out"
      ? lineSink("program-out", out)
      : ConsoleStdout.lineBuffered((line) => { if (line !== "") postMessage({ type: "output", id, stream: stdoutStream, text: line }); }),
    diagnosticSink(state),
    new PreopenDirectory(".", root),
  ];
  const wasi = new WASI(args, [], fds, { debug: false });
  return WebAssembly.instantiate(compilerModule, { wasi_snapshot_preview1: wasi.wasiImport }).then((instance) => {
    let code;
    try { code = wasi.start(instance); }
    catch (e) { if (e instanceof WASIProcExit) code = e.code; else throw e; }
    finally { fds[1].write(encoder.encode("\n")); fds[2].write(encoder.encode("\n")); }
    return code;
  });
}

async function job({ id, action, path, source, lang, stdin, target, code: diagnosticCode }) {
  const started = performance.now();
  const langFlag = "--lang=" + (lang === "en" ? "en" : "ar");
  if (action === "explain") {
    const exitCode = await runCompiler(["sultanc", langFlag, "--color=never", "explain", diagnosticCode], new Map(), id);
    postMessage({ type: "done", id, phase: "explain", code: exitCode, ms: performance.now() - started });
    return;
  }
  const root = makeRoot(path, source);
  const native = action === "build" && NATIVE_TARGETS.has(target);
  const common = ["sultanc", langFlag, "--color=never", "--diagnostic-format=json"];
  if (action === "interpret") {
    // The compiler checks the program, then runs it in its own interpreter;
    // the program's output is the compiler's stdout.
    let code;
    try {
      code = await runCompiler([...common, "run", path], root, id, { stdin, stdoutStream: "program-out" });
    } catch (e) {
      postMessage({ type: "done", id, phase: "compile", code: -1, error: String(e), ms: performance.now() - started });
      return;
    }
    postMessage({ type: "done", id, phase: "interpret", code, ms: performance.now() - started });
    return;
  }
  const args = action === "check"
    ? [...common, "check", path]
    : [...common, path, "--target=" + (native ? target : "wasm32-wasi"), "-o", "build/program" + (native ? "" : ".wasm")];
  let compileCode;
  try {
    compileCode = await runCompiler(args, root, id);
  } catch (e) {
    postMessage({ type: "done", id, phase: "compile", code: -1, error: String(e), ms: performance.now() - started });
    return;
  }
  const compileMs = performance.now() - started;
  if (action === "check" || compileCode !== 0) {
    postMessage({ type: "done", id, phase: "compile", code: compileCode, ms: compileMs });
    return;
  }
  const program = root.get("build").contents.get(native ? "program" : "program.wasm");
  if (!program) {
    postMessage({ type: "done", id, phase: "compile", code: -1, error: "no program produced", ms: compileMs });
    return;
  }
  if (action === "build") {
    const bytes = program.data.slice();
    postMessage({ type: "done", id, phase: "build", code: 0, ms: compileMs, target: native ? target : "wasm32-wasi", bytes }, [bytes.buffer]);
    return;
  }
  postMessage({ type: "compiled", id, ms: compileMs, bytes: program.data.length });
  postMessage({ type: "command", id, argv: ["./build/program.wasm"] });
  const runStarted = performance.now();
  let runCode;
  try {
    const module = await WebAssembly.compile(program.data);
    const runRoot = new Map([["build", new Directory(new Map())]]);
    runCode = await runWasi(module, ["program"], runRoot, stdin, "program-");
  } catch (e) {
    postMessage({ type: "done", id, phase: "run", code: -1, error: String(e), ms: performance.now() - runStarted, compileMs });
    return;
  }
  postMessage({ type: "done", id, phase: "run", code: runCode, ms: performance.now() - runStarted, compileMs });
}

onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "init") init(msg).catch((e) => postMessage({ type: "fatal", error: String(e) }));
  else if (msg.type === "job") job(msg).catch((e) => postMessage({ type: "done", id: msg.id, phase: "compile", code: -1, error: String(e) }));
};
