#!/usr/bin/env node
/**
 * Pack the release archive from a staging copy of the package, as glass-ux does. The archive carries the
 * built library, its types, styles and workers, the guides, API pages, llms.txt and skills. It leaves out
 * what only this repository uses: source maps, the TypeDoc JSON model, the working briefs, scripts and
 * devDependencies. The documentation site ships separately as glass-ux-image-docs.tar.gz.
 *
 * Run after `pnpm build` (or `pnpm docs:build`).
 *   node scripts/pack-release.mjs --out .handoff/release   write the archive there
 *   node scripts/pack-release.mjs --check                  pack to a temporary folder, check, discard
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const outIndex = args.indexOf("--out");
const out = outIndex === -1 ? join(root, ".handoff") : resolve(args[outIndex + 1]);
/** 0.1.0 measured 1.77 MB unpacked and 0.48 MB compressed; about 15% headroom, so growth is a decision, not drift. */
const BUDGET = { unpacked: 2_050_000, archive: 560_000 };

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!existsSync(join(root, "dist/core/index.js"))) {
  console.error("pack-release: dist/ is missing. Run pnpm build first.");
  process.exit(1);
}
const excluded = (path) =>
  path.endsWith(".map") ||
  path === "docs/api/typedoc.json" ||
  // Working briefs describe plans, and installed docs are read as the truth.
  path === "docs/stage-3-brief.md" ||
  path === "docs/gaps-brief.md" ||
  path.startsWith("docs/translation-review/");

const stage = mkdtempSync(join(tmpdir(), "glass-ux-image-pack-"));
try {
  // Copy what `files` names, minus the exclusions.
  const copy = (path) => {
    const from = join(root, path);
    if (!existsSync(from)) return;
    if (statSync(from).isDirectory()) {
      for (const entry of readdirSync(from)) copy(join(path, entry));
    } else if (!excluded(path)) {
      mkdirSync(join(stage, path, ".."), { recursive: true });
      cpSync(from, join(stage, path));
    }
  };
  for (const pattern of manifest.files) {
    const base = pattern.replace(/\/\*\*\/\*\.md$/, "");
    if (base !== pattern) {
      const walk = (dir) => {
        for (const entry of readdirSync(join(root, dir))) {
          const path = join(dir, entry);
          if (statSync(join(root, path)).isDirectory()) walk(path);
          else if (path.endsWith(".md")) copy(path);
        }
      };
      walk(base);
    } else copy(pattern);
  }
  const { scripts: _scripts, devDependencies: _dev, private: _private, packageManager: _pm, ...published } = manifest;
  writeFileSync(join(stage, "package.json"), `${JSON.stringify(published, null, 2)}\n`);

  // Every export must point at a file in the archive.
  const missing = [];
  const targets = (value) => (typeof value === "string" ? [value] : Object.values(value ?? {}).flatMap(targets));
  for (const [entry, value] of Object.entries(published.exports ?? {})) {
    for (const target of targets(value)) {
      if (target.includes("*")) {
        const dir = join(stage, target.slice(0, target.indexOf("*")));
        if (!existsSync(dir)) missing.push(`${entry} → ${target}`);
      } else if (!existsSync(join(stage, target))) missing.push(`${entry} → ${target}`);
    }
  }
  if (missing.length) throw new Error(`exports point at missing files:\n  ${missing.join("\n  ")}`);

  const size = (dir) => readdirSync(dir).reduce((sum, entry) => {
    const path = join(dir, entry);
    return sum + (statSync(path).isDirectory() ? size(path) : statSync(path).size);
  }, 0);
  const unpacked = size(stage);
  const destination = check ? mkdtempSync(join(tmpdir(), "glass-ux-image-out-")) : out;
  mkdirSync(destination, { recursive: true });
  const archiveName = execFileSync("npm", ["pack", "--silent", "--pack-destination", destination], { cwd: stage, encoding: "utf8" }).trim().split("\n").at(-1);
  const archive = statSync(join(destination, archiveName)).size;
  console.log(`${archiveName}: ${(unpacked / 1e6).toFixed(2)} MB unpacked, ${(archive / 1e6).toFixed(2)} MB compressed`);
  if (unpacked > BUDGET.unpacked || archive > BUDGET.archive) throw new Error(`over budget (${BUDGET.unpacked / 1e6} MB unpacked, ${BUDGET.archive / 1e6} MB compressed)`);
  if (check) rmSync(destination, { recursive: true, force: true });
  else console.log(`wrote ${relative(root, join(destination, archiveName))}`);
} catch (error) {
  console.error(`pack-release: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(stage, { recursive: true, force: true });
}
