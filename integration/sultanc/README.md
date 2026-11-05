# Files for the compiler repository

The playground downloads its compiler from SultanC releases. These two files
belong in `sultan-language/sultanc`, at the same paths, and are kept here only
so the playground repository documents everything it depends on:

| File | Purpose |
|---|---|
| `.github/workflows/playground-wasm.yml` | On each published release: build the compiler for `wasm32-wasi` (bootstrapped from the wasm seed, C compiler only), smoke-test it, attach `sultanc-wasm32-wasi.wasm` and its `.sha256` to the release |
| `.github/scripts/playground-wasm-smoke.mjs` | The smoke test: `check` and compile an example under Node's WASI, then run the result |

They are not used by this repository's own build.
