export { makeTokenStore, type TokenStore, type Tokens } from "./tokens.js";
export { createClients } from "./transport.js";
export {
  makeAuth,
  type AuthState,
  type AuthConfig,
  type Identity,
} from "./auth.js";
export { useRequireAuth, useRequireRole } from "./guards.js";
export { errorMessage, isCode, isNotFound, isTransient } from "./errors.js";
export { Code, ConnectError } from "@connectrpc/connect";
export { makeQueryClient, refetchUntil } from "./query.js";
export { useAuthedQuery } from "./use-authed-query.js";
export { useCountUp } from "./use-count-up.js";
export {
  streamAssistantChat,
  type ChatCitation,
  type ChatStreamHandlers,
} from "./chat-stream.js";
export {
  startProctoring,
  type ProctorRuntimeOptions,
  type ProctorEvent,
  type ProctorEventType,
} from "./proctor-runtime.js";
export { downloadBytes, XLSX_MIME } from "./download.js";
export { TERMINAL_STATES, TERMS_VERSION } from "./constants.js";
export { decodeJwtPayload } from "./jwt.js";
export { pollingBackoff, type PollingBackoffOptions } from "./polling";

// De-duplicated app logic (lifted from candidate + company)
export {
  useThreadMessages,
  type ThreadMessage,
  type ThreadMessagesClient,
  type OptimisticMessage,
} from "./use-thread-messages.js";
export {
  formatLocal,
  dayLabel,
  timeLabel,
  localInputToUtcIso,
  viewerTimeZone,
} from "./datetime.js";
export {
  createSchedulingClient,
  makeMockSchedulingClient,
  schedulingClient,
  scheduleQueryKey,
  SCHEDULING_USE_MOCK,
  type BookingStatus,
  type ProposedSlot,
  type ScheduleDTO,
  type IcsResponse,
  type SchedulingClient,
} from "./scheduling.js";
