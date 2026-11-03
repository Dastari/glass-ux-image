import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve(process.env.DOCS_DIR ?? "apps/docs/dist"),
  base = process.env.DOCS_BASE ?? "/glass-ux-image/";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".md": "text/plain",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    // The site lives under the GitHub Pages base path; the bare host goes there.
    if (base !== "/" && (url.pathname === "/" || url.pathname === base.slice(0, -1))) {
      res.writeHead(302, { Location: base });
      res.end();
      return;
    }
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let file = resolve(
      root,
      decodeURIComponent(url.pathname.slice(base.length)),
    );
    if (file !== root && !file.startsWith(root + "/")) throw Error("Path");
    if ((await stat(file)).isDirectory()) file += "/index.html";
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(Number(process.env.DOCS_PORT ?? 4332), "0.0.0.0");
