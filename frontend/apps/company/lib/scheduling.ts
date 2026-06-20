// Typed scheduling client + an in-memory mock. `SchedulingService` is NEW and NOT yet
// generated (gRPC), so both surfaces build against this typed shape until `pnpm gen` exposes
// the real `api.scheduling.*`. The mock matches the real client's surface 1:1, so the swap is
// a single line: `createSchedulingClient(api)` instead of `makeMockSchedulingClient()`.
//
// Wire contract (admin.scheduling.v1, see docs/superpowers/plans/v2-screens/scheduling.md):
// all datetimes are ISO-8601 UTC strings; the propose form converts local->UTC before calling.

export const MAX_SLOTS = 10;

export type BookingStatus = "proposed" | "booked" | "completed" | "cancelled";

export interface ProposedSlot {
  startAt: string; // ISO-8601 UTC
  durationMinutes: number;
}

export interface ScheduleDTO {
  applicationId: string;
  status: BookingStatus;
  slots: ProposedSlot[]; // the open proposal's offered set ([] if none open)
  chosenStartAt: string;
  chosenDurationMinutes: number;
  location: string;
  note: string;
  cancelledBy: string;
}

export interface IcsResponse {
  filename: string;
  content: string;
}

/** The surface both the mock and the real `api.scheduling.*` client satisfy. */
export interface SchedulingClient {
  getSchedule(applicationId: string): Promise<ScheduleDTO>;
  proposeSlots(
    applicationId: string,
    slots: ProposedSlot[],
    location: string,
    note: string,
  ): Promise<ScheduleDTO>;
  reschedule(
    applicationId: string,
    slots: ProposedSlot[],
    location: string,
    note: string,
  ): Promise<ScheduleDTO>;
  /** startAtUtcIso must be one of the offered slots' startAt (already UTC). */
  chooseSlot(applicationId: string, startAtUtcIso: string): Promise<ScheduleDTO>;
  cancel(applicationId: string): Promise<ScheduleDTO>;
  getIcs(applicationId: string): Promise<IcsResponse>;
}

// Query key owned here so the panel + its invalidation never drift.
export const scheduleQueryKey = (applicationId: string) =>
  ["scheduling", "schedule", applicationId] as const;

/** Adapt the generated gRPC client into the `SchedulingClient` surface. Drops the mock once
 * `pnpm gen` adds `scheduling` to `ApiClients`; until then the cast keeps this compiling. */
export function createSchedulingClient(api: unknown): SchedulingClient {
  const sched = (api as { scheduling: SchedulingGrpc }).scheduling;
  return {
    getSchedule: (applicationId) => sched.getSchedule({ applicationId }),
    proposeSlots: (applicationId, slots, location, note) =>
      sched.proposeSlots({ applicationId, slots, location, note }),
    reschedule: (applicationId, slots, location, note) =>
      sched.reschedule({ applicationId, slots, location, note }),
    chooseSlot: (applicationId, startAt) => sched.chooseSlot({ applicationId, startAt }),
    cancel: (applicationId) => sched.cancel({ applicationId }),
    getIcs: (applicationId) => sched.getIcs({ applicationId }),
  };
}

// The generated-client shape `createSchedulingClient` expects post-`pnpm gen`.
interface SchedulingGrpc {
  getSchedule(req: { applicationId: string }): Promise<ScheduleDTO>;
  proposeSlots(req: {
    applicationId: string;
    slots: ProposedSlot[];
    location: string;
    note: string;
  }): Promise<ScheduleDTO>;
  reschedule(req: {
    applicationId: string;
    slots: ProposedSlot[];
    location: string;
    note: string;
  }): Promise<ScheduleDTO>;
  chooseSlot(req: { applicationId: string; startAt: string }): Promise<ScheduleDTO>;
  cancel(req: { applicationId: string }): Promise<ScheduleDTO>;
  getIcs(req: { applicationId: string }): Promise<IcsResponse>;
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

/** In-memory `SchedulingClient`: starts `proposed` with 3 future slots; `chooseSlot` flips to
 * `booked`; `cancel` flips to `cancelled`. Keyed by application id so a recruiter `proposeSlots`
 * and a candidate `chooseSlot` against the same id share one store within a session. */
export function makeMockSchedulingClient(): SchedulingClient {
  const store = new Map<string, ScheduleDTO>();

  function seed(applicationId: string): ScheduleDTO {
    const existing = store.get(applicationId);
    if (existing) return existing;
    const dto: ScheduleDTO = {
      applicationId,
      status: "proposed",
      slots: [
        { startAt: hoursFromNow(48), durationMinutes: 60 },
        { startAt: hoursFromNow(72), durationMinutes: 60 },
        { startAt: hoursFromNow(96), durationMinutes: 45 },
      ],
      chosenStartAt: "",
      chosenDurationMinutes: 0,
      location: "Google Meet (link sent on confirmation)",
      note: "Looking forward to speaking with you. Pick whichever time works best.",
      cancelledBy: "",
    };
    store.set(applicationId, dto);
    return dto;
  }

  return {
    getSchedule: async (applicationId) => structuredClone(seed(applicationId)),
    proposeSlots: async (applicationId, slots, location, note) => {
      const dto: ScheduleDTO = {
        applicationId,
        status: "proposed",
        slots,
        chosenStartAt: "",
        chosenDurationMinutes: 0,
        location,
        note,
        cancelledBy: "",
      };
      store.set(applicationId, dto);
      return structuredClone(dto);
    },
    reschedule: async (applicationId, slots, location, note) => {
      const dto: ScheduleDTO = {
        applicationId,
        status: "proposed",
        slots,
        chosenStartAt: "",
        chosenDurationMinutes: 0,
        location,
        note,
        cancelledBy: "",
      };
      store.set(applicationId, dto);
      return structuredClone(dto);
    },
    chooseSlot: async (applicationId, startAtUtcIso) => {
      const dto = seed(applicationId);
      const slot = dto.slots.find((s) => s.startAt === startAtUtcIso);
      const next: ScheduleDTO = {
        ...dto,
        status: "booked",
        chosenStartAt: startAtUtcIso,
        chosenDurationMinutes: slot?.durationMinutes ?? 60,
      };
      store.set(applicationId, next);
      return structuredClone(next);
    },
    cancel: async (applicationId) => {
      const dto = seed(applicationId);
      const next: ScheduleDTO = { ...dto, status: "cancelled", cancelledBy: "company" };
      store.set(applicationId, next);
      return structuredClone(next);
    },
    getIcs: async (applicationId) => {
      const dto = seed(applicationId);
      const start = dto.chosenStartAt || dto.slots[0]?.startAt || hoursFromNow(48);
      const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
      const content = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Aptura//Scheduling//EN",
        "BEGIN:VEVENT",
        `UID:aptura-interview-${applicationId}@aptura`,
        `DTSTAMP:${stamp(new Date().toISOString())}`,
        `DTSTART:${stamp(start)}`,
        "SUMMARY:Aptura interview",
        `LOCATION:${dto.location}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
      return { filename: `aptura-interview-${applicationId}.ics`, content };
    },
  };
}

/** The client both surfaces use: the mock when `NEXT_PUBLIC_MOCK=1`, else the real gRPC client.
 * Memoize the result at the call site (`useMemo`) so the mock's store survives re-renders. */
export function schedulingClient(api: unknown): SchedulingClient {
  return USE_MOCK ? makeMockSchedulingClient() : createSchedulingClient(api);
}
