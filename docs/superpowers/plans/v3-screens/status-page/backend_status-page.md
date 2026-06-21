# System Status — Backend contract (v3 · NEW scope, contract TBD)

> **Screen.** System status / public health page. **FE consumer:** [`frontend_status-page.md`](./frontend_status-page.md).
> **Status:** `NEW — proposed surface, contract TBD` · pre-launch is fully static; post-launch
> integrates with an external monitoring provider (Statuspage.io / Better Uptime / Pingdom or
> equivalent) and the typed surface below is what the FE consumes.
> **Truthfulness note:** Aptura is pre-launch. **No fabricated uptime numbers, no fabricated
> incident history, no fabricated "Last incident" badges.** See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).

## Functionalities

- **Pre-launch (today).** The status page renders entirely from static FE content (`content.ts`)
  and the proposed `statusClient` interface. The mock client returns `OPERATIONAL` for the
  overall state and for every one of the six services; the incidents list is empty. **No
  backend is wired today.**
- **Post-launch (integrated).** The FE calls two RPCs on a `StatusService`:
  - `GetStatus()` — returns the current overall state, the per-service states, and the
    `lastChecked` timestamp.
  - `ListIncidents({ since })` — returns recent incidents (default 30 days), each with severity,
    state, timeline of updates, and affected services.
- **Subscribe to updates.** Pre-launch the FE uses a `mailto:` link. Post-launch a third RPC
  `Subscribe({ email })` is added (notional — see "Service & RPCs" below). The subscription
  endpoint is **explicitly out of scope** for the pre-launch ship; the FE just calls a
  no-op-mock until the contract lands.
- **Integration model.** The expected integration is server-side: a small server reads from the
  external monitoring provider's API (Statuspage.io / Better Uptime / Pingdom equivalent),
  normalizes the response to the contract below, and serves it through the `StatusService`. The
  FE does NOT call the third-party provider directly — that keeps secrets server-side and lets
  us swap providers without an FE deploy.

## Service & RPCs

Pre-launch: no gRPC, no REST, no proto delta. The proposed post-launch surface below documents
what the FE will consume — engineering wires it once the monitoring integration is selected.

```proto
// proto/status/v1/status.proto (PROPOSED — not yet committed)
syntax = "proto3";
package aptura.status.v1;

service StatusService {
  rpc GetStatus(GetStatusRequest) returns (GetStatusResponse);
  rpc ListIncidents(ListIncidentsRequest) returns (ListIncidentsResponse);
  // Optional / out of scope at launch:
  // rpc Subscribe(SubscribeRequest) returns (SubscribeResponse);
}

enum StatusState {
  STATUS_STATE_UNSPECIFIED = 0;
  OPERATIONAL = 1;
  DEGRADED    = 2;
  OUTAGE      = 3;
  MAINTENANCE = 4;
}

enum ServiceId {
  SERVICE_ID_UNSPECIFIED = 0;
  MARKETPLACE     = 1;
  AUTH            = 2;
  INTERVIEWS      = 3;
  REPORTS         = 4;
  NOTIFICATIONS   = 5;
  INTEGRATIONS    = 6;
}

enum IncidentSeverity {
  INCIDENT_SEVERITY_UNSPECIFIED = 0;
  MINOR    = 1;
  MAJOR    = 2;
  CRITICAL = 3;
}

enum IncidentState {
  INCIDENT_STATE_UNSPECIFIED = 0;
  INVESTIGATING = 1;
  IDENTIFIED    = 2;
  MONITORING    = 3;
  RESOLVED      = 4;
}
```

## Request / Response structures (PROPOSED — TBD)

```proto
message GetStatusRequest {}

message ServiceStatus {
  ServiceId   id    = 1;   // one of the 6 fixed services
  StatusState state = 2;
}

message GetStatusResponse {
  StatusState              overall      = 1;
  repeated ServiceStatus   services     = 2;   // length == 6 (one per fixed service)
  string                   last_checked = 3;   // ISO-8601 timestamp
  string                   provider     = 4;   // "statuspage.io" | "better-uptime" | ...
}

message ListIncidentsRequest {
  // Optional "since" filter — server defaults to last 30 days when unset.
  string since = 1;   // ISO-8601 timestamp
}

message IncidentUpdate {
  string        at      = 1;   // ISO-8601 timestamp
  IncidentState state   = 2;
  string        message = 3;
}

message Incident {
  string                   id              = 1;
  string                   title           = 2;
  IncidentSeverity         severity        = 3;
  IncidentState            state           = 4;
  string                   started_at      = 5;   // ISO-8601 timestamp
  string                   resolved_at     = 6;   // ISO-8601 timestamp; empty if unresolved
  repeated ServiceId       affected        = 7;
  repeated IncidentUpdate  updates         = 8;   // newest-last
}

message ListIncidentsResponse {
  repeated Incident incidents = 1;   // empty until post-launch monitoring is wired
}
```

The FE consumes a TypeScript mirror under
`apps/candidate/lib/status-client.ts`:

```ts
type ServiceId =
  | "marketplace" | "auth" | "interviews"
  | "reports" | "notifications" | "integrations";

type StatusState = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "MAINTENANCE";

type IncidentSeverity = "MINOR" | "MAJOR" | "CRITICAL";
type IncidentState    = "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";

type StatusSnapshot = {
  overall: StatusState;
  services: { id: ServiceId; state: StatusState }[];
  lastChecked: string;          // ISO-8601
  provider: string;             // monitoring provider id
};

type IncidentUpdate = { at: string; state: IncidentState; message: string };

type Incident = {
  id: string;
  title: string;
  severity: IncidentSeverity;
  state: IncidentState;
  startedAt: string;
  resolvedAt?: string;
  affected: ServiceId[];
  updates: IncidentUpdate[];
};

interface StatusClient {
  getStatus(): Promise<StatusSnapshot>;
  listIncidents(args: { since: string }): Promise<{ incidents: Incident[] }>;
}
```

All copy and data MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- No fabricated uptime percentages anywhere in the response.
- No fabricated incident history in the mock fixture — `listIncidents` returns `{ incidents: [] }`.
- No fabricated "Last incident: 47 days ago" derived field; the FE renders an empty state.
- Service names in the response match the 6 fixed names (no marketing aliases).

## Data required

- **Pre-launch:** None. Static FE content + a typed in-memory mock.
- **Post-launch:** No new Aptura collections. The monitoring provider is the system of record;
  the `StatusService` is a thin normalizer on top of the provider's API. If a subscription
  endpoint is added, it owns a `status_subscriptions` collection with shape
  `{ _id, email, createdAt, optOutToken }` — explicitly **out of scope** until the
  monitoring integration is selected.

## Errors & edge cases

- **Pre-launch.** No fetch → no error paths. The FE always renders `OPERATIONAL` + empty
  incidents.
- **Post-launch.**
  - `GetStatus` upstream failure → the server returns `503 UNAVAILABLE` and the FE renders the
    SSR static fallback (`OPERATIONAL` + the inline note "Live status unavailable — showing last
    known."). **The FE never invents an "All operational" claim** — the note is the
    anti-fiction guardrail.
  - `ListIncidents` upstream failure → the server returns `503 UNAVAILABLE`; the FE renders the
    "No incidents in the last 30 days" empty state and a small inline note "Incident history
    temporarily unavailable."
  - Stale `lastChecked` (> 5 minutes) → the FE displays the timestamp with a `Stale` micro-pill
    next to it so the reader knows the live check hasn't run recently.
- **Auth.** Public, token-free, crawlable; SSR-rendered. The endpoint is rate-limited per IP at
  the gateway (no per-request auth).

## Cross-references

- Frontend plan: [`frontend_status-page.md`](./frontend_status-page.md).
- Design language: [`_design-language.md`](../_design-language.md).
- Sister footer / utility surfaces: [`../privacy-policy/backend_privacy-policy.md`](../privacy-policy/backend_privacy-policy.md) ·
  [`../terms-of-service/backend_terms-of-service.md`](../terms-of-service/backend_terms-of-service.md) ·
  [`../dpa/backend_dpa.md`](../dpa/backend_dpa.md).
- Footer chrome demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).

## Implementation note

**Pre-launch shows static "All systems operational" content; integration with monitoring
(Statuspage.io / Better Uptime / Pingdom / equivalent) is post-pilot.** Until the integration
is wired the FE consumes the typed mock client; the proto file above is intentionally **not yet
committed** to the repo — it lands in the same PR as the monitoring integration so the contract
and the implementation ship together.
