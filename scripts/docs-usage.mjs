import ts from "typescript";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
// Extract code shown by foundation pages too, so a string-valued CodeBlock is not an unchecked
// second API. The effect selector varies only its serialisable id and parameter data.
export function generateFoundationUsage() {
  for (const file of readdirSync("src/gallery/sections").filter((f) =>
    f.endsWith(".section.tsx"),
  )) {
    const path = `src/gallery/sections/${file}`,
      text = readFileSync(path, "utf8"),
      sf = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
    let index = 0;
    function visit(n) {
      if (
        ts.isJsxAttribute(n) &&
        n.name.getText(sf) === "code" &&
        n.initializer &&
        ts.isJsxExpression(n.initializer)
      ) {
        const expr = n.initializer.expression;
        let code;
        if (expr && ts.isStringLiteralLike(expr)) code = expr.text;
        if (expr && ts.isTemplateExpression(expr)) {
          code = expr.head.text;
          for (const span of expr.templateSpans) {
            const value = span.expression.getText(sf);
            if (value === "id") code += "sample-effect";
            else if (value === "JSON.stringify(selected.params)") code += "{}";
            else throw Error(`Unchecked code interpolation ${path}: ${value}`);
            code += span.literal.text;
          }
        }
        if (code !== undefined)
          writeFileSync(
            `src/gallery/examples/foundation-${file.replace(".section.tsx", "")}-${++index}.tsx.txt`,
            code + "\n",
          );
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
  }
}
