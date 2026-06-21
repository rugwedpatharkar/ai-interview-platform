import type { ApiClients } from "@ip/api-client";

import { getLastCorrelationId } from "./transport.js";

export type ClientEventName =
  | "auth.registered"
  | "auth.logged_in"
  | "job.viewed"
  | "application.started"
  | "application.submitted"
  | "aptitude.started"
  | "aptitude.submitted"
  | "interview.started"
  | "interview.completed"
  | "report.viewed"
  | "decision.made"
  | "notification.opened"
  | "client.error"
  | "client.slow_render"
  | "api.timeout"
  | "api.unauthorized_refresh";

interface InitOptions {
  buildSha: string;
  client: { observability: ApiClients["observability"] };
}

// Plain-object shapes matching proto MessageInitShape — no $typeName required at call sites.
interface ErrPayload {
  name: string;
  message: string;
  stackTruncated8k: string;
}

interface ErrEvent {
  eventId: string;
  correlationId: string;
  occurredAtMs: bigint;
  component: string;
  route: string;
  buildSha: string;
  userAgentHash: string;
  error: ErrPayload;
}

interface AnaEvent {
  eventId: string;
  correlationId: string;
  occurredAtMs: bigint;
  name: string;
  route: string;
  propertiesJson: string;
}

const _eventBuffer: AnaEvent[] = [];
const _errorBuffer: ErrEvent[] = [];
let _buildSha = "";
let _client: InitOptions["client"] | null = null;
let _flushTimer: ReturnType<typeof setInterval> | null = null;

const _FLUSH_INTERVAL_MS = 1000;
const _BUFFER_MAX = 50;
const _STACK_CAP = 8192;
const _PROPS_CAP = 4096;

const _REDACT_RE =
  /(password|token|secret|api[_-]?key|authorization|bearer)([=:][^\s,;"]*)/gi;
const _redact = (s: string): string => (s ? s.replace(_REDACT_RE, "$1=***") : s);

const _uuid = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // RFC 4122 v4 fallback (cryptographically weaker but acceptable for event ids)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const _hashUA = (s: string): string => {
  // DJB2 32-bit — non-cryptographic, just a stable bucket for the UA.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
};

const _redactProps = (props: Record<string, unknown>): string => {
  try {
    const json = JSON.stringify(props);
    return _redact(json.slice(0, _PROPS_CAP));
  } catch {
    return "{}";
  }
};

export function initObservability(opts: InitOptions): void {
  _buildSha = opts.buildSha;
  _client = opts.client;
  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(() => void _flushNow(), _FLUSH_INTERVAL_MS);
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e: ErrorEvent) =>
    recordError(e.error ?? e.message, { component: "window.onerror" }),
  );
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) =>
    recordError(e.reason, { component: "unhandledrejection" }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void _flushNow();
  });
}

export function track(name: ClientEventName, properties: Record<string, unknown> = {}): void {
  if (!_client) return;
  _eventBuffer.push({
    eventId: _uuid(),
    correlationId: getLastCorrelationId() ?? "",
    occurredAtMs: BigInt(Date.now()),
    name,
    route: typeof window !== "undefined" ? window.location.pathname : "",
    propertiesJson: _redactProps(properties),
  });
  if (_eventBuffer.length >= _BUFFER_MAX) void _flushNow();
}

export function recordError(err: unknown, ctx: { component?: string } = {}): void {
  if (!_client) return;
  const e = err instanceof Error ? err : new Error(String(err));
  _errorBuffer.push({
    eventId: _uuid(),
    correlationId: getLastCorrelationId() ?? "",
    occurredAtMs: BigInt(Date.now()),
    component: ctx.component ?? "unknown",
    route: typeof window !== "undefined" ? window.location.pathname : "",
    buildSha: _buildSha,
    userAgentHash: typeof navigator !== "undefined" ? _hashUA(navigator.userAgent) : "",
    error: {
      name: e.name,
      message: _redact(e.message),
      stackTruncated8k: _redact((e.stack ?? "").slice(0, _STACK_CAP)),
    },
  });
  if (_errorBuffer.length >= _BUFFER_MAX) void _flushNow();
}

async function _flushNow(): Promise<void> {
  if (!_client) return;
  const errs = _errorBuffer.splice(0);
  const evts = _eventBuffer.splice(0);
  if (!errs.length && !evts.length) return;
  try {
    const calls: Promise<unknown>[] = [];
    if (errs.length) calls.push(_client.observability.recordClientError({ events: errs }));
    if (evts.length) calls.push(_client.observability.recordClientEvent({ events: evts }));
    await Promise.all(calls);
  } catch {
    // Drop on flush failure — never recurse into recordError from here.
  }
}

// Test-only reset — exposed so tests can wipe module state between runs without
// needing vi.resetModules() (which breaks fake-timer context in some vitest versions).
export function _resetForTest(): void {
  _eventBuffer.splice(0);
  _errorBuffer.splice(0);
  _buildSha = "";
  _client = null;
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}
