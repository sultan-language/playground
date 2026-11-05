#!/usr/bin/env bash
# Rebuilds compiler/assets/ from a SultanC checkout.
#
#   scripts/build-assets.sh <path-to-sultanc-checkout> [version-label]
#
# For local development, before a release with the compiler wasm exists.
# CI uses scripts/fetch-compiler.mjs (release download) instead.
#
# Uses the checkout's Stage2 compiler (build/sultanc; built with
# `./build.sh --bootstrap=wasm`, which needs only a C compiler) to build the
# compiler itself for wasm32-wasi (Native-only, no LLVM), then generates the
# std, examples and keyword-map assets.
set -euo pipefail
checkout=${1:?usage: scripts/build-assets.sh <sultanc-checkout> [version-label]}
label=${2:-$(cd "$checkout" && (git describe --tags --always 2>/dev/null || date +%Y%m%d))}
here=$(cd "$(dirname "$0")/.." && pwd)
sultanc="$checkout/build/sultanc"
if [ ! -x "$sultanc" ]; then
  echo "building SultanC Stage2 in $checkout (./build.sh) ..." >&2
  (cd "$checkout" && ./build.sh --bootstrap=wasm)
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(cd "$checkout" && "$sultanc" compiler/main.sn --backend=native --target=wasm32-wasi --emit=exe \
  --module-source=compiler.backend.provider.llvm.llvm_codegen=compiler/backend/provider/llvm/unavailable.sn \
  -o "$tmp/sultanc.wasm")
cd "$here"
node scripts/gen-assets.mjs "$checkout" "$tmp/sultanc.wasm" "$label"
