import { expect } from "vitest";

/**
 * Label-first assertions, matching the style these specs were originally written in.
 *
 * They began as a zero-dependency harness because no runner was wired in this app and
 * adding one would have churned the shared lockfile mid-session. That constraint is
 * gone — `@ip/shared` already runs on vitest — and the scripts were silently never
 * executed in the meantime. Keeping the call-site style means the specs themselves
 * barely changed; only the plumbing underneath did.
 *
 * `toEqual` is deep equality, matching the original `JSON.stringify` comparison.
 */
export function expectEqual<T>(label: string, actual: T, expected: T): void {
  expect(actual, label).toEqual(expected);
}

export function expectTrue(label: string, actual: boolean): void {
  expect(actual, label).toBe(true);
}
