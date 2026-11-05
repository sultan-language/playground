// Builds the deployable site into build/site/:
//   public/        page, styles, service worker (copied)
//   src/           bundled with esbuild into app.js and worker.js
//   compiler/assets/  compiler and data (from fetch-compiler or build-assets)
import { build } from "esbuild";
import { cp, rm, mkdir, writeFile, access } from "node:fs/promises";
import { ASSETS, SITE } from "./paths.mjs";

if (!(await access(`${ASSETS}/sultanc.wasm`).then(() => true, () => false))) {
  console.error(`build: ${ASSETS}/ is missing. Run \`npm run fetch-compiler\` (release) or \`npm run assets:local -- <sultanc checkout>\` first.`);
  process.exit(1);
}
await rm(SITE, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });
await cp("public", SITE, { recursive: true });
await cp(ASSETS, `${SITE}/assets`, { recursive: true });
const result = await build({
  entryPoints: { app: "src/main.js", worker: "src/worker.js" },
  outdir: SITE,
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  metafile: true,
});
// CodeMirror breaks silently (extensions stop working) when two copies of
// @codemirror/state or /view are bundled, so fail the build instead.
for (const pkg of ["@codemirror/state", "@codemirror/view"]) {
  const copies = new Set(Object.keys(result.metafile.inputs)
    .map((f) => f.match(new RegExp(`^(.*node_modules/${pkg})/`))?.[1]).filter(Boolean));
  if (copies.size > 1) {
    console.error(`build: ${copies.size} copies of ${pkg} bundled:\n  ${[...copies].join("\n  ")}\nAlign the @codemirror versions in package.json.`);
    process.exit(1);
  }
}
// GitHub Pages: serve files and folders that start with "_" too.
await writeFile(`${SITE}/.nojekyll`, "");
console.log(`built ${SITE}/`);
