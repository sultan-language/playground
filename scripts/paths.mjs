// Where files live.
//
//   compiler/release.json  which SultanC release the playground uses (committed)
//   compiler/assets/       compiler wasm, std, examples, keyword map (generated, git-ignored)
//   compiler/cache/        downloaded release and SultanC source checkout (git-ignored)
//
//   build/                 npm build output only; always safe to delete (git-ignored)
//   build/site/            the deployable site: public/ + bundled src/ + compiler assets
//   build/test/            screenshots and other test output
export const RELEASE = "compiler/release.json";
export const ASSETS = "compiler/assets";
export const CACHE = "compiler/cache";
export const BUILD = "build";
export const SITE = "build/site";
export const TEST = "build/test";
