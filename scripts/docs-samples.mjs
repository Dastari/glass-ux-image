import { generateFoundationUsage } from "./docs-usage.mjs";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
export const templateIds = [
  "single-adjustment",
  "avatar-cropper",
  "product-photo",
  "social-post",
  "annotator",
  "develop-view",
  "full-suite",
];
export function generateSamples() {
  mkdirSync("src/gallery/examples", { recursive: true });
  generateFoundationUsage();
  for (const id of templateIds)
    writeFileSync(
      `src/gallery/examples/template-${id}.tsx.txt`,
      readFileSync(`apps/demo/src/templates/${id}.tsx`),
    );
}
export function checkSamples() {
  const failures = [];
  for (const id of templateIds) {
    const source = readFileSync(`apps/demo/src/templates/${id}.tsx`, "utf8");
    if (
      source !==
      readFileSync(`src/gallery/examples/template-${id}.tsx.txt`, "utf8")
    )
      failures.push(`Stale template ${id}: run pnpm docs:api`);
    for (const [, entry] of source.matchAll(/from\s+['"]([^'"]+)['"]/g))
      if (entry.startsWith(".") || entry.includes("/gallery"))
        failures.push(`Template ${id} imports a non-public entry ${entry}`);
  }
  return failures;
}
