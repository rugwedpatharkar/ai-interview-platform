import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetForTest,
  initObservability,
  recordError,
  track,
} from "./observability.js";

const _makeClient = () => ({
  observability: {
    recordClientError: vi.fn(async () => ({ acceptedEventIds: [] })),
    recordClientEvent: vi.fn(async () => ({ acceptedEventIds: [] })),
  },
});

describe("observability SDK", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
  });

  it("track buffers and flushes after timer fires", async () => {
    const client = _makeClient();
    initObservability({ buildSha: "abc", client });
    track("auth.logged_in", { role: "candidate" });
    expect(client.observability.recordClientEvent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100);
    expect(client.observability.recordClientEvent).toHaveBeenCalledOnce();
  });

  it("recordError wraps non-Error inputs", async () => {
    const client = _makeClient();
    initObservability({ buildSha: "abc", client });
    recordError("a plain string");
    await vi.advanceTimersByTimeAsync(1100);
    const call = client.observability.recordClientError.mock.calls[0][0];
    expect(call.events[0].error.message).toContain("a plain string");
  });

  it("PII redactor strips bearer tokens from messages", async () => {
    const client = _makeClient();
    initObservability({ buildSha: "abc", client });
    recordError(new Error("Authorization=Bearer abc123"));
    await vi.advanceTimersByTimeAsync(1100);
    const call = client.observability.recordClientError.mock.calls[0][0];
    expect(call.events[0].error.message).not.toContain("Bearer abc123");
    expect(call.events[0].error.message).toContain("***");
  });

  it("empty buffer flush is a no-op (no calls)", async () => {
    const client = _makeClient();
    initObservability({ buildSha: "abc", client });
    await vi.advanceTimersByTimeAsync(1100);
    expect(client.observability.recordClientEvent).not.toHaveBeenCalled();
    expect(client.observability.recordClientError).not.toHaveBeenCalled();
  });

  it("track without init silently drops", () => {
    // _client is null after _resetForTest(); track must be a no-op.
    expect(() => track("auth.logged_in", {})).not.toThrow();
  });
});
