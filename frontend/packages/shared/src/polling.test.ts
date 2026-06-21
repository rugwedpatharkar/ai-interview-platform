import { describe, it, expect } from "vitest";
import { pollingBackoff } from "./polling";

const q = (n: number) => ({
  state: { dataUpdateCount: n, status: "success" as const },
});

describe("pollingBackoff", () => {
  it("returns initialMs on first poll (jitter aside)", () => {
    const cb = pollingBackoff({ initialMs: 500, capMs: 30_000, maxPolls: 10, jitterRatio: 0 });
    const interval = cb(q(0)) as number;
    expect(interval).toBe(500);
  });

  it("doubles each poll until capMs is hit", () => {
    const cb = pollingBackoff({ initialMs: 500, capMs: 30_000, maxPolls: 20, jitterRatio: 0 });
    expect(cb(q(0))).toBe(500);
    expect(cb(q(1))).toBe(1_000);
    expect(cb(q(2))).toBe(2_000);
    expect(cb(q(3))).toBe(4_000);
    expect(cb(q(7))).toBe(30_000);
    expect(cb(q(10))).toBe(30_000);
  });

  it("stops after maxPolls", () => {
    const cb = pollingBackoff({ initialMs: 500, capMs: 30_000, maxPolls: 5, jitterRatio: 0 });
    expect(cb(q(0))).toBeTypeOf("number");
    expect(cb(q(4))).toBeTypeOf("number");
    expect(cb(q(5))).toBe(false);
    expect(cb(q(99))).toBe(false);
  });

  it("adds jitter within the configured ratio", () => {
    const cb = pollingBackoff({ initialMs: 1_000, capMs: 30_000, maxPolls: 10, jitterRatio: 0.2 });
    const samples = Array.from({ length: 50 }, () => cb(q(0)) as number);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(1_000);
      expect(s).toBeLessThanOrEqual(1_200);
    }
  });
});
