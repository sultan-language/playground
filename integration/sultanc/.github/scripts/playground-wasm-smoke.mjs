// Smoke test for the wasm32-wasi compiler that the playground runs.
//
//   node .github/scripts/playground-wasm-smoke.mjs <sultanc.wasm>
//
// Runs from the repository root. Uses Node's built-in WASI, the same
// preview1 interface the browser shim provides:
//   1. `check` an English and an Arabic example;
//   2. compile the English example to wasm32-wasi and run the result.
import { readFile, rm, mkdir } from "node:fs/promises";
import { WASI } from "node:wasi";

const [compilerPath] = process.argv.slice(2);
if (!compilerPath) {
  console.error("usage: node playground-wasm-smoke.mjs <sultanc.wasm>");
  process.exit(2);
}
const compiler = await WebAssembly.compile(await readFile(compilerPath));

async function run(module, args) {
  const wasi = new WASI({ version: "preview1", args, env: {}, preopens: { ".": "." }, returnOnExit: true });
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
  return wasi.start(instance);
}

let failed = 0;
const expect = (name, code) => {
  console.log(`${code === 0 ? "PASS" : "FAIL"} ${name} (exit ${code})`);
  if (code !== 0) failed++;
};

expect("check examples/en/basics/hello.sn", await run(compiler, ["sultanc", "--color=never", "check", "examples/en/basics/hello.sn"]));
expect("check examples/ar/basics/hello.sn", await run(compiler, ["sultanc", "--lang=en", "--color=never", "check", "examples/ar/basics/hello.sn"]));

await rm("build/playground-smoke", { recursive: true, force: true });
await mkdir("build/playground-smoke", { recursive: true });
const out = "build/playground-smoke/hello.wasm";
expect("compile examples/en/basics/hello.sn", await run(compiler, ["sultanc", "--color=never", "examples/en/basics/hello.sn", "--target=wasm32-wasi", "-o", out]));
if (!failed) expect("run compiled program", await run(await WebAssembly.compile(await readFile(out)), ["hello"]));

process.exit(failed ? 1 : 0);
