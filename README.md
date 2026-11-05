<div align="center">

<img src="docs/images/playground-en.png" alt="SultanC Playground: a program compiled and run in the browser, with the terminal showing the compiler command, the build and the program output" width="880">

# SultanC Playground

Write, check and run [SultanC](https://github.com/sultan-language/sultanc) in your browser, in Arabic or in English.

**[Open the playground](https://sultan-language.github.io/playground/)** &nbsp;·&nbsp; [SultanC](https://github.com/sultan-language/sultanc) &nbsp;·&nbsp; [Issues](https://github.com/sultan-language/playground/issues)

</div>

---

The SultanC Playground is the quickest way to try the language. There is nothing to install and no server in between: the real SultanC compiler, built for WebAssembly, runs on your own machine inside the page. You write a program, press **Run**, and watch the compiler work in a terminal, the same way it would on your desktop.

Programs can be written with Arabic or English keywords, and the compiler can explain itself in either language. Switching the code from one to the other is a single click.

## What you can do

**Compile and run.** The default mode compiles your program to WebAssembly and runs it right away. The terminal shows the exact `sultanc` command, the build, the program's output and its exit code, with timings for each step. Programs can read from standard input.

**Use the interpreter.** Switch the mode to **Interpreter** to run the program with `sultanc run`, the compiler's own interpreter, without generating code.

**Build a native program.** Choose **macOS (Apple silicon)** or **Linux (x86-64)** as the target, and the compiler running in your browser produces a native executable for you to download.

**Understand errors.** Diagnostics appear in the terminal as the compiler prints them, with the file, line and column, and the offending code marked. They are also underlined in the editor, and listed under **Problems**, where you can jump to each one, read the compiler's longer explanation, or apply a fix the compiler suggests.

<div align="center">
<img src="docs/images/playground-ar-diagnostics.png" alt="An Arabic program with a type error: the terminal shows the diagnostic in Arabic and the editor underlines the mistake" width="880">
</div>

**Work in Arabic or English.** The **Code** switch rewrites keywords, built-in types and standard-library names in the other language and leaves your own names, strings and comments untouched. The **Messages** switch changes the interface and the compiler's diagnostics. Arabic names follow the compiler's own rules, so spellings the compiler treats as the same name (with or without tatweel, أ / إ / آ or ا) are treated the same way here.

**Share.** **Share** copies a link that contains your program, compressed into the address itself. Opening the link restores the code, its language, the message language and the mode. Nothing is uploaded or stored.

**Feel at home.** Your work is kept in the browser between visits. The editor and terminal can be resized, there are light and dark themes, and `?` lists the keyboard shortcuts. Adding `?embed` to the address gives a compact version for documentation pages.

<div align="center">
<img src="docs/images/playground-light.png" alt="The playground in the light theme, with an Arabic program and its output" width="880">
</div>

### Limits

Everything runs inside the browser's sandbox, so programs have no network access, cannot start other processes or sleep, and see files only for the length of a single run. A program is stopped after 10 seconds (30 seconds in the interpreter).

## How it works

```
 Page (editor, terminal, problems)
   │
   ▼
 Web Worker ── WASI preview 1, with an in-memory file system
   ├── sultanc.wasm       the SultanC compiler
   │     reads the standard library and your file, writes build/program.wasm
   └── program.wasm       your program, run in a fresh sandbox
```

The compiler is the standard self-hosted SultanC compiler, built for `wasm32-wasi`. A Web Worker gives it a small in-memory file system containing the standard library, the examples and your file, then runs it exactly as a shell would. Running the work off the main thread keeps the page responsive, and a program that never finishes is stopped by replacing the worker. A service worker caches the compiler, so it downloads again only when a new version is published.

The editor is built on CodeMirror 6. Its highlighting, the Arabic ⇄ English switch and the identifier rules are all generated from the compiler's own registries, so they follow the language as it changes.

## Compiler versions

The playground always runs a published SultanC release. `compiler/release.json` names which one: `"latest"`, or a specific tag.

Each SultanC release carries a ready-made `sultanc-wasm32-wasi.wasm` and its SHA-256, produced by a workflow in the compiler repository. When the playground is built, it downloads that file, checks the hash, and takes the standard library and examples from the same tag. The workflow and its smoke test are kept in [`integration/sultanc/`](integration/sultanc/) for reference.

## Running it locally

You need [Node.js](https://nodejs.org) 20 or later.

```sh
git clone https://github.com/sultan-language/playground.git
cd playground
npm ci
npm run fetch-compiler      # download the compiler release named in compiler/release.json
npm start                   # build the site and serve it at http://localhost:8080
```

To try a compiler you have built yourself, point the playground at your SultanC checkout instead of downloading a release:

```sh
npm run assets:local -- ../sultanc
npm start
```

The page has to be served over HTTP; opening `index.html` directly from disk will not work.

### Tests

```sh
npx playwright install chromium    # first time only
npm test                           # end-to-end test in a headless browser
npm run test:surface               # every example still compiles after the Arabic ⇄ English switch
```

### Project layout

| Path | |
|---|---|
| `public/` | The page, its stylesheet and the service worker |
| `src/` | The application: editor and interface (`main.js`), terminal, compiler worker, language switch, highlighting |
| `scripts/` | Asset generation, release download, build, local server and tests |
| `compiler/release.json` | The SultanC release in use |
| `integration/sultanc/` | The release workflow that lives in the compiler repository |
| `docs/images/` | Screenshots used in this README |

Generated files are never committed. `compiler/assets/` and `compiler/cache/` hold the downloaded compiler; `build/` holds the built site and test output and can be deleted at any time with `npm run clean`.

## Deployment

The site is published to GitHub Pages by the **Deploy** workflow. Every pull request is built and tested; every push to `main` is built, tested and deployed. The workflow can also be run by hand to deploy a particular compiler release.

To set it up once:

1. Copy the two files from `integration/sultanc/` into the compiler repository, at the same paths, and run its **Playground Compiler** workflow for an existing release.
2. Here, under **Settings → Pages**, set the source to **GitHub Actions**.
3. Optionally, to redeploy the playground automatically whenever a compiler release is published, create a fine-grained token with **Actions: write** on this repository and save it in the compiler repository as `PLAYGROUND_DISPATCH_TOKEN`.

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/sultan-language/playground/issues). Problems with the language or its messages belong in the [compiler repository](https://github.com/sultan-language/sultanc/issues). Please run `npm test` before opening a pull request.

## License

The playground is released under the [MIT License](LICENSE). The SultanC compiler and standard library it runs are MIT-licensed as part of [sultan-language/sultanc](https://github.com/sultan-language/sultanc).
