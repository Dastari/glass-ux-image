// Typecheck prose examples, generated usage and the exact copyable template sources separately
// from pnpm check. Generated site content never joins the package build.
import ts from "typescript";
import { resolve } from "node:path";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
const dir = ".docs-kit/samples";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const paths = [];
for (const file of [
  "../README.md",
  ...readdirSync("docs").filter(
    (f) => f.endsWith(".md") && f !== "stage-3-brief.md",
  ),
]) {
  const text = readFileSync(`docs/${file}`, "utf8");
  let i = 0;
  for (const [, language, code] of text.matchAll(
    /```(tsx?|jsx)\n([\s\S]*?)```/g,
  )) {
    const path = `${dir}/${file.replaceAll("/", "-")}-${++i}.${language === "ts" ? "ts" : "tsx"}`;
    writeFileSync(path, code + "\nexport {};\n");
    paths.push(path);
  }
}
for (const file of readdirSync("src/gallery/examples").filter((f) =>
  f.endsWith(".tsx.txt"),
)) {
  const path = `${dir}/${file.replace(".txt", "")}`;
  writeFileSync(path, readFileSync(`src/gallery/examples/${file}`));
  paths.push(path);
}
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const program = ts.createProgram(
  [...new Set([...parsed.fileNames, ...paths].map((path) => resolve(path)))],
  { ...parsed.options, noEmit: true, types: ["vite/client"] },
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else console.log(`docs samples: ${paths.length} code samples typechecked`);
