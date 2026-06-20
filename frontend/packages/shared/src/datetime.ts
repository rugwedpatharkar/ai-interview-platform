// The single UTC<->local boundary for scheduling. Pure, no deps — `Intl` is built-in.
// Every persisted instant is UTC; the viewer's zone is applied ONLY at render. The propose
// form converts each local input -> UTC via `localInputToUtcIso` BEFORE the gRPC call.

/** Render a UTC ISO instant in the viewer's resolved zone, e.g. "Jun 24, 2026, 2:00 PM GMT+5:30". */
export function formatLocal(isoUtc: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(new Date(isoUtc));
}

/** Group key (the local calendar day) for a UTC instant, e.g. "Wednesday, June 24". */
export function dayLabel(isoUtc: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(isoUtc));
}

/** Just the local time-of-day for a UTC instant, e.g. "2:00 PM". */
export function timeLabel(isoUtc: string): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(isoUtc));
}

/** Convert a <input type="datetime-local"> value -> a UTC ISO instant BEFORE the gRPC call.
 * `new Date("2026-06-24T14:00")` is parsed in the viewer's zone, so `.toISOString()` is the
 * correct UTC instant for that wall-clock time. */
export function localInputToUtcIso(localDateTime: string): string {
  return new Date(localDateTime).toISOString();
}

/** The viewer's resolved zone, for a "times shown in {zone}" caption. */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
