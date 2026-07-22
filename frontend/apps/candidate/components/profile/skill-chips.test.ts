// Spec for the pure skill-chip ops.

import { it } from "vitest";

import { expectEqual } from "../../test-harness.js";
import { addSkill, removeSkill } from "./skill-chips.js";

it("adds a trimmed skill", () => {
  expectEqual("addSkill.trimmed", addSkill(["react"], "  TypeScript "), ["react", "TypeScript"]);
});

it("dedups case-exact", () => {
  expectEqual("addSkill.dedup", addSkill(["react"], "react"), ["react"]);
});

it("ignores empty input", () => {
  expectEqual("addSkill.empty", addSkill(["react"], "  "), ["react"]);
});

it("removes by value", () => {
  expectEqual("removeSkill.byValue", removeSkill(["react", "go"], "react"), ["go"]);
});
