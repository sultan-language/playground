// Minimal static server for local testing: node scripts/serve.mjs [dir=build/site] [port=8080]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { SITE } from "./paths.mjs";

const root = path.resolve(process.argv[2] || SITE);
const port = Number(process.argv[3] || 8080);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    await stat(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
