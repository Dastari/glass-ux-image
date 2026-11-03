/* Screenshots every mock-up from the built fixture: node capture.mjs [name…] */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";

const dist = new URL("./dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const path = pathname === "/" ? "index.html" : pathname;
  try {
    const body = await readFile(join(dist, path));
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
const scale = Number(process.env.SCALE ?? 2);
const out = new URL(process.env.OUT ?? "./shots/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const all = {
  window: ["s=window", desktop],
  docked: ["s=docked", desktop], focus: ["s=focus", desktop], adjust: ["s=adjust", desktop], filters: ["s=filters", desktop],
  export: ["s=export", desktop], open: ["s=open", desktop], pieces: ["s=pieces", desktop],
  "rtl-light": ["s=docked&mode=light&dir=rtl&lang=ar&palette=ocean", desktop],
  "phone-edit": ["s=phone-edit", phone], "phone-layers": ["s=phone-layers", phone],
};
const wanted = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(all);
const browser = await chromium.launch();
for (const name of wanted) {
  const [query, viewport] = all[name];
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: "jpeg", quality: 88 });
  console.log(name, errors.length ? errors.slice(0, 3) : "ok");
  await page.close();
}
await browser.close();
server.close();
