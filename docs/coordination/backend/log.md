# Backend session log

One line per meaningful commit. Newest at the bottom.

- 2026-07-28 · BE · session `backend-autonomous-session-657afd` started — bootstrapping coordination scaffolding, picking up known-open items (analytics facet, voice heartbeat, erase-guards, recovery-code single-use test).
- 2026-07-28 · BE · **C3 follow-up ✅ analytics `get_no_ghosting_kpis` rewritten as a single Mongo `$facet`** (gate GREEN; 552 admin · 306 ai-agents · 46 mcp-data · 53 mcp-capability + lib). One aggregation returns totals / responded / pending_review / stale_over_sla / decided_last_7d / median_response_hours. Removed the now-unused `iter_by_comp` streamer. Median uses `$percentile` (Mongo 7, `method: "approximate"`) — exact enough for the dashboard, and the resource still tests exactly against the in-memory fake. **Deployment note:** no proto or FE contract change; the RPC response shape is unchanged.
