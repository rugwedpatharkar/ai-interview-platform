// The UTC<->local boundary lives in @ip/shared now (candidate superset, byte-identical).
// Re-exported so existing imports (`../lib/datetime`) resolve unchanged.
export {
  formatLocal,
  dayLabel,
  timeLabel,
  localInputToUtcIso,
  viewerTimeZone,
} from "@ip/shared";
