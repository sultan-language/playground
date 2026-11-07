// End-to-end test in headless Chromium: node scripts/test-browser.mjs
// Builds nothing; run `npm run build` first. Needs the `playwright` package.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { SITE, TEST } from "./paths.mjs";
mkdirSync(TEST, { recursive: true });

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const port = 8765;
const server = spawn(process.execPath, ["scripts/serve.mjs", SITE, String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 500));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: "en-US" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !document.getElementById("run").disabled, null, { timeout: 60000 });
  check("compiler loads", true);

  const output = () => page.$$eval("#output .t-line", (els) => els.map((e) => e.textContent).join("\n"));
  const status = () => page.textContent("#status");
  const waitDone = () => page.waitForFunction(() => !document.body.classList.contains("busy"), null, { timeout: 60000 });

  // 1. English hello world.
  await page.click("#run"); await waitDone();
  let out = await output();
  check("run English hello", out.includes("Hello from SultanC") && out.includes("42"), JSON.stringify(out.slice(0, 80)));
  check("exit status shown", /exit code 0|بالرمز 0/.test(await status()), await status());

  // 2. Switch code to Arabic (unedited example loads its counterpart) and run.
  await page.click('[data-surface="ar"]');
  const code = await page.evaluate(() => window.__playground.getCode());
  check("switch to Arabic loads counterpart", code.includes("الرئيسية"));
  await page.click("#run"); await waitDone();
  out = await output();
  check("run Arabic hello", out.includes("مرحبا") && out.includes("42"), JSON.stringify(out.slice(0, 80)));

  // 3. A type error: Problems tab, editor underline, Arabic and English messages, explain.
  const problems = () => page.$$eval("#problems .problem", (els) => els.map((e) => e.textContent).join("\n"));
  await page.evaluate(() => window.__playground.setCode('import std.io.println;\n\ndef main(): int {\n    let x: int = "hello";\n    println(x);\n    return 0;\n}\n'));
  await page.click('[data-ui="en"]');
  await page.click("#check"); await waitDone();
  let probs = await problems();
  check("English diagnostic in Problems", /SULTANC-[A-Z-]+/.test(probs) && /(^|\D)4:\d+/.test(probs), probs.slice(0, 100));
  const termText = await output();
  check("terminal shows the command", /\$ sultanc --lang=en check /.test(termText), termText.split("\n")[0]);
  check("terminal renders the diagnostic", /error\[SULTANC-[A-Z-]+\]/.test(termText) && /--> .*:4:\d+/.test(termText) && (await page.$$("#output .t-mark")).length > 0, termText.slice(0, 160));
  check("terminal shows the failure summary", /Failed\s+1 error/.test(termText), termText.split("\n").at(-1));
  await page.click('[data-tab="problems"]');
  check("error underline in editor", (await page.$$(".cm-lintRange-error")).length > 0);
  await page.click("#problems .problem-loc");
  const sel = await page.evaluate(() => { const v = window.__playground.view; const r = v.state.selection.main; return v.state.doc.lineAt(r.from).number; });
  check("clicking a problem selects its line", sel === 4, String(sel));
  await page.click("#problems button.link");
  await page.waitForFunction(() => document.querySelector("#problems .problem-explain")?.textContent.length > 10, null, { timeout: 30000 });
  check("explain shows the compiler's explanation", true);
  await page.click('[data-ui="ar"]');
  await page.click("#check"); await waitDone();
  await page.click('[data-tab="problems"]');
  probs = await problems();
  check("Arabic diagnostic", /[؀-ۿ]/.test(probs), probs.slice(0, 80));

  // 3b. Native build: the compiler in the browser builds a Linux executable for download.
  await page.evaluate(() => { const p = window.__playground; p.setSurface("en", { convertCode: false }); p.state.path = "examples/en/basics/hello.sn"; p.setCode(p.state.examples.files[p.state.path]); p.setTarget("x86_64-linux"); });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#run")]);
  const dlPath = await dl.path();
  const head = (await import("node:fs")).readFileSync(dlPath).subarray(0, 4);
  check("native build downloads an ELF executable", dl.suggestedFilename() === "hello" && head[0] === 0x7f && head[1] === 0x45, dl.suggestedFilename());
  await page.evaluate(() => window.__playground.setTarget("browser"));

  // 3b2. Interpreter mode: the terminal shows `sultanc run` and the outcome,
  // whatever the deployed compiler's interpreter can do today.
  await page.evaluate(() => { const p = window.__playground; p.setSurface("en", { convertCode: false }); p.state.path = "examples/en/basics/hello.sn"; p.setCode(p.state.examples.files[p.state.path]); p.setTarget("interpreter"); });
  const modeState = await page.evaluate(() => ({ pressed: document.querySelector('[data-mode="interpret"]').getAttribute("aria-pressed"), hidden: document.getElementById("target-field").hidden }));
  check("mode switch shows Interpreter", modeState.pressed === "true" && modeState.hidden, JSON.stringify(modeState));
  await page.click("#run"); await waitDone();
  out = await output();
  check("interpreter runs `sultanc run`", /\$ sultanc --lang=(en|ar) run examples\/en\/basics\/hello\.sn/.test(out) && /(Exited|Failed|انتهى|فشل)/.test(out), out.split("\n").slice(0, 3).join(" | "));
  await page.click('[data-mode="compile"]');
  check("mode switch back to Compiler restores the target list", await page.isVisible("#target-field") && (await page.inputValue("#target")) === "browser");

  // 3c. Arabic identifiers: highlighted as names, alef variants treated as one identity.
  await page.evaluate(() => { const p = window.__playground; p.setSurface("ar", { convertCode: false }); p.state.path = "main.sn"; p.setCode('استورد std.io.println;\n\nعرف الرئيسية(): عدد {\n    دع الإسم: نص = "سلطان";\n    اطبع_سطر(الاسم);\n    ارجع 0;\n}\n'); });
  await page.click("#run"); await waitDone();
  check("Arabic identifiers (alef identity) compile and run", (await output()).includes("سلطان"), await status());

  // 4. stdin.
  await page.evaluate(() => window.__playground.setCode('import std.io.println;\nimport std.io.read;\n\ndef main(): int {\n    println("ok");\n    return 0;\n}\n'));
  // (Generic program; stdin plumbing is exercised by the read_input example below.)
  const hasReadInput = await page.evaluate(() => window.__playground.state.examples.files["examples/en/io/read_input.sn"] !== undefined);
  if (hasReadInput) {
    await page.evaluate(() => { const p = window.__playground; p.state.path = "examples/en/io/read_input.sn"; p.setCode(p.state.examples.files["examples/en/io/read_input.sn"]); });
    await page.evaluate(() => { document.getElementById("stdin-box").open = true; });
    await page.fill("#stdin", "Wasim\n");
    await page.click("#run"); await waitDone();
    out = await output();
    check("stdin reaches the program", out.includes("Wasim"), JSON.stringify(out.slice(0, 120)));
  }

  // 5. Share link round trip.
  await page.evaluate(() => { const p = window.__playground; p.state.path = "main.sn"; p.setCode('import std.io.println;\n\ndef main(): int {\n    println("shared!");\n    return 0;\n}\n'); });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click("#share");
  await page.waitForFunction(() => location.hash.includes("c="), null, { timeout: 10000 });
  check("share link keeps the messages language", page.url().includes("l="));
  const url = page.url();
  const page2 = await browser.newPage();
  await page2.goto(url);
  await page2.waitForFunction(() => !document.getElementById("run").disabled, null, { timeout: 60000 });
  const code2 = await page2.evaluate(() => window.__playground.getCode());
  check("share link restores code", code2.includes("shared!"));
  await page2.click("#run");
  await page2.waitForFunction(() => !document.body.classList.contains("busy"), null, { timeout: 60000 });
  check("shared program runs", (await page2.$$eval("#output .t-stdout", (e) => e.map((x) => x.textContent).join("\n"))).includes("shared!"));

  // 5b. An unedited example is shared by path only.
  await page.evaluate(() => { const p = window.__playground; p.state.path = "examples/en/basics/hello.sn"; p.setCode(p.state.examples.files[p.state.path]); });
  await page.click("#share");
  await page.waitForFunction(() => location.hash.includes("p=examples"), null, { timeout: 10000 });
  check("unedited example gives a short link", !page.url().includes("c="), page.url().split("#")[1]);

  // 6. Infinite loop is stopped by the time limit, and the playground recovers.
  await page.evaluate(() => window.__playground.setCode('def main(): int {\n    let i: mutable int = 0;\n    while (true) { i := i + 1; }\n    return 0;\n}\n'));
  await page.click("#run");
  await page.waitForFunction(() => document.getElementById("status").dataset.kind === "error" && !document.getElementById("run").disabled, null, { timeout: 60000 });
  out = await output();
  check("time limit stops a stuck program", /time limit|المهلة/.test(out), (await status()));
  await page.evaluate(() => window.__playground.setCode('import std.io.println;\n\ndef main(): int {\n    println("after");\n    return 0;\n}\n'));
  await page.click("#run"); await waitDone();
  check("playground recovers after time limit", (await output()).includes("after"));

  // 7. Arabic UI layout is right-to-left; screenshot both.
  await page.click('[data-ui="ar"]');
  check("Arabic UI is RTL", (await page.getAttribute("html", "dir")) === "rtl");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { const p = window.__playground; p.setSurface("ar", { convertCode: false }); p.state.path = "examples/ar/basics/hello.sn"; p.setCode(p.state.examples.files[p.state.path]); });
  await page.click("#run"); await waitDone();
  await page.screenshot({ path: process.env.SHOT_AR || `${TEST}/screenshot-ar.png` });
  await page.evaluate(() => window.__playground.setCode('استورد std.io.println;\n\nعرف الرئيسية(): عدد {\n    دع س: عدد = "نص";\n    أرجع 0;\n}\n'));
  await page.click("#check"); await waitDone();
  await page.hover(".cm-lintRange-error").catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: process.env.SHOT_PROBLEMS || `${TEST}/screenshot-problems.png` });
  await page.click('[data-ui="en"]');
  await page.evaluate(() => { const p = window.__playground; p.setSurface("en", { convertCode: true }); });
  await page.click("#run"); await waitDone();
  await page.screenshot({ path: process.env.SHOT_EN || `${TEST}/screenshot-en.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: process.env.SHOT_MOBILE || `${TEST}/screenshot-mobile.png` });

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
