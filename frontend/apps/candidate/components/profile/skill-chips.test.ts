// Spec for the pure skill-chip ops. The frontend monorepo has no test runner wired,
// and pulling vitest into this app would churn the shared root lockfile while a backend
// session shares the working tree — so this mirrors lib/funnel.test.ts: a zero-dependency
// harness that typechecks under the app's tsconfig (`**/*.ts`) and runs standalone via
// `npx tsx components/profile/skill-chips.test.ts`.

import { addSkill, removeSkill } from "./skill-chips.js";

let failures = 0;

function expectEqual<T>(label: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(
      `✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// adds a trimmed skill
expectEqual("addSkill.trimmed", addSkill(["react"], "  TypeScript "), ["react", "TypeScript"]);
// case-exact dedup
expectEqual("addSkill.dedup", addSkill(["react"], "react"), ["react"]);
// empty ignored
expectEqual("addSkill.empty", addSkill(["react"], "  "), ["react"]);
// removes by value
expectEqual("removeSkill.byValue", removeSkill(["react", "go"], "react"), ["go"]);

if (failures > 0) {
  console.error(`\nskill-chips.test: ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log("skill-chips.test: all assertions passed");
}
