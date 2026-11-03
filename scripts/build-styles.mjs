import { readFile, writeFile } from "node:fs/promises";
const domains = ["geometry","develop","retouch","effects","files","layers","workspace"];
const css = await Promise.all(["src/styles.css",...domains.map(d=>`src/styles/${d}.css`)].map(p=>readFile(p,"utf8")));
await writeFile("dist/styles.css",css.join("\n"));
