// Where files live.
//
//   compiler/source.json   which SultanC repository and ref the compiler comes from (committed)
//   compiler/assets/       compiler wasm, std, examples, keyword map (generated, git-ignored)
//   compiler/cache/        SultanC checkout and the decompressed seed (git-ignored)
//
//   build/                 npm build output only; always safe to delete (git-ignored)
//   build/site/            the deployable site: public/ + bundled src/ + compiler assets
//   build/test/            screenshots and other test output
export const SOURCE = "compiler/source.json";
export const ASSETS = "compiler/assets";
export const CACHE = "compiler/cache";
export const BUILD = "build";
export const SITE = "build/site";
export const TEST = "build/test";
