import { cpSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const base = process.env.DOCS_BASE ?? "/glass-ux-image/";
execFileSync(
  "pnpm",
  [
    "--filter",
    "glass-ux-image-demo",
    "exec",
    "vite",
    "build",
    "--emptyOutDir",
    "--outDir",
    resolve(".docs-kit/demo"),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      GLASS_UX_IMAGE_BASE: `${base.replace(/\/$/, "")}/demo/`,
    },
  },
);
cpSync(".docs-kit/demo", "apps/docs/dist/demo", { recursive: true });
cpSync("llms.txt", "apps/docs/dist/llms.txt");
cpSync("skills", "apps/docs/dist/skills", { recursive: true });
cpSync("docs", "apps/docs/dist/docs", {
  recursive: true,
  filter: (path) => !path.includes("/api"),
});
