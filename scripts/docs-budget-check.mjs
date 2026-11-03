// The kit's consumer budgets exclude React and lazy chunks. This check preserves the complete
// suite budget and basic-kit graph exclusions with exactly the package's release measurements.
import { execFileSync } from "node:child_process";
export function checkCompleteBudgets() {
  try {
    execFileSync(process.execPath, ["scripts/size-check.mjs"], {
      stdio: "pipe",
    });
    return [];
  } catch (error) {
    return [String(error.stdout ?? "") + String(error.stderr ?? error)];
  }
}
