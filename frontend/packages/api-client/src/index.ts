// Typed gRPC-web client for the admin service. Generated descriptors (src/gen) come from
// src/admin/app/routes/pb/*.proto via `pnpm gen` — the single source of truth for the API.
import {
  type Client,
  type Interceptor,
  type Transport,
  createClient,
} from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";

import { AnalyticsService } from "./gen/analytics_pb.js";
import { ApplicationService } from "./gen/application_pb.js";
import { AptitudeService } from "./gen/aptitude_pb.js";
import { AuthService } from "./gen/auth_pb.js";
import { CodingService } from "./gen/coding_pb.js";
import { CompanyProfileService } from "./gen/company_profile_pb.js";
import { ComplianceService } from "./gen/compliance_pb.js";
import { DecisionService } from "./gen/decision_pb.js";
import { DiscoveryService } from "./gen/discovery_pb.js";
import { JobService } from "./gen/job_pb.js";
import { JobAlertsService } from "./gen/job_alerts_pb.js";
import { MessagingService } from "./gen/messaging_pb.js";
import { NotificationService } from "./gen/notification_pb.js";
import { PreferencesService } from "./gen/preferences_pb.js";
import { ProfileService } from "./gen/profile_pb.js";
import { RecommendationService } from "./gen/recommendation_pb.js";
import { ReportService } from "./gen/report_pb.js";
import { RubricService } from "./gen/rubric_pb.js";
import { SavedJobsService } from "./gen/saved_jobs_pb.js";
import { SchedulingService } from "./gen/scheduling_pb.js";
import { SettingsService } from "./gen/settings_pb.js";
import { SourcingService } from "./gen/sourcing_pb.js";
import { TalentService } from "./gen/talent_pb.js";
import { TeamService } from "./gen/team_pb.js";
import { ObservabilityService } from "./gen/observability_pb.js";
// ai-agents services (interview/chat/jd/practice) — same gRPC-web translator, different origin.
import { ChatService } from "./gen/chat_pb.js";
import { InterviewService } from "./gen/interview_pb.js";
import { JdService } from "./gen/jd_pb.js";
import { PracticeService } from "./gen/practice_pb.js";

// Re-export every generated message type + schema so apps import them from one place.
// NOTE: 3 sibling pairs share message names (different proto packages, same TS name):
//   auth ↔ settings        — both define OkResponse (collides on TS name)
//   messaging ↔ notification — both define MarkReadRequest/Response
//   interview ↔ practice   — both define QuestionResponse / TurnResponse
// Strategy: wildcard-export the "first" (auth, messaging, interview); explicit-export the
// other side with a service-prefixed alias for the colliding names. Apps that call
// `useAuth().api.<svc>.method(plainObj)` need none of these — protobuf-es accepts plain
// object literals at the call boundary.
export * from "./gen/analytics_pb.js";
export * from "./gen/application_pb.js";
export * from "./gen/aptitude_pb.js";
export * from "./gen/auth_pb.js";
export * from "./gen/coding_pb.js";
export * from "./gen/company_profile_pb.js";
export * from "./gen/compliance_pb.js";
export * from "./gen/decision_pb.js";
export * from "./gen/discovery_pb.js";
export * from "./gen/job_pb.js";
export * from "./gen/job_alerts_pb.js";
export * from "./gen/messaging_pb.js";
export * from "./gen/preferences_pb.js";
export * from "./gen/profile_pb.js";
export * from "./gen/recommendation_pb.js";
export * from "./gen/report_pb.js";
export * from "./gen/rubric_pb.js";
export * from "./gen/saved_jobs_pb.js";
export * from "./gen/scheduling_pb.js";
export * from "./gen/sourcing_pb.js";
export * from "./gen/talent_pb.js";
export * from "./gen/team_pb.js";
export * from "./gen/observability_pb.js";
export * from "./gen/chat_pb.js";
export * from "./gen/interview_pb.js";
export * from "./gen/jd_pb.js";

// settings — collides with auth on OkResponse{,Schema}. Alias as SettingsOk*.
export {
  type ListSessionsRequest,
  ListSessionsRequestSchema,
  type SessionDTO,
  SessionDTOSchema,
  type ListSessionsResponse,
  ListSessionsResponseSchema,
  type RevokeSessionRequest,
  RevokeSessionRequestSchema,
  type RevokeAllSessionsRequest,
  RevokeAllSessionsRequestSchema,
  type ChangePasswordRequest,
  ChangePasswordRequestSchema,
  type RequestEmailChangeRequest,
  RequestEmailChangeRequestSchema,
  type VerifyEmailChangeRequest,
  VerifyEmailChangeRequestSchema,
  type SetupTotpRequest,
  SetupTotpRequestSchema,
  type SetupTotpResponse,
  SetupTotpResponseSchema,
  type VerifyTotpRequest,
  VerifyTotpRequestSchema,
  type VerifyTotpResponse,
  VerifyTotpResponseSchema,
  type DisableTotpRequest,
  DisableTotpRequestSchema,
  type OkResponse as SettingsOkResponse,
  OkResponseSchema as SettingsOkResponseSchema,
  type QuietHours,
  QuietHoursSchema,
  type GetNotificationPrefsRequest,
  GetNotificationPrefsRequestSchema,
  type NotificationPrefs,
  NotificationPrefsSchema,
  SettingsService,
} from "./gen/settings_pb.js";

// notification — collides with messaging on MarkReadRequest/Response{,Schema}.
// Alias as Notification* for the colliding names.
export {
  type NotificationDTO,
  NotificationDTOSchema,
  type ListRequest as NotificationListRequest,
  ListRequestSchema as NotificationListRequestSchema,
  type ListResponse as NotificationListResponse,
  ListResponseSchema as NotificationListResponseSchema,
  type MarkReadRequest as NotificationMarkReadRequest,
  MarkReadRequestSchema as NotificationMarkReadRequestSchema,
  type MarkAllReadRequest,
  MarkAllReadRequestSchema,
  type MarkReadResponse as NotificationMarkReadResponse,
  MarkReadResponseSchema as NotificationMarkReadResponseSchema,
  NotificationService,
} from "./gen/notification_pb.js";

// practice — collides with interview on QuestionResponse / TurnResponse{,Schema}.
// Alias as Practice* for the colliding names.
export {
  type StartPracticeRequest,
  StartPracticeRequestSchema,
  type QuestionResponse as PracticeQuestionResponse,
  QuestionResponseSchema as PracticeQuestionResponseSchema,
  type SubmitPracticeTurnRequest,
  SubmitPracticeTurnRequestSchema,
  type TurnResponse as PracticeTurnResponse,
  TurnResponseSchema as PracticeTurnResponseSchema,
  type ListPracticeSessionsRequest,
  ListPracticeSessionsRequestSchema,
  type PracticeSession,
  PracticeSessionSchema,
  type PracticeSessionList,
  PracticeSessionListSchema,
  type GetPracticeFeedbackRequest,
  GetPracticeFeedbackRequestSchema,
  type GrowthFeedback,
  GrowthFeedbackSchema,
  type PracticeFeedback,
  PracticeFeedbackSchema,
  PracticeService,
} from "./gen/practice_pb.js";

/** Attaches `Authorization: Bearer <token>` when a token is available. */
function authInterceptor(getToken: () => string | null | undefined): Interceptor {
  return (next) => (req) => {
    const token = getToken();
    if (token) req.header.set("Authorization", `Bearer ${token}`);
    return next(req);
  };
}

export interface AdminClients {
  auth: Client<typeof AuthService>;
  jobs: Client<typeof JobService>;
  applications: Client<typeof ApplicationService>;
  aptitude: Client<typeof AptitudeService>;
  decisions: Client<typeof DecisionService>;
  profile: Client<typeof ProfileService>;
  reports: Client<typeof ReportService>;
  compliance: Client<typeof ComplianceService>;
  recommendations: Client<typeof RecommendationService>;
  analytics: Client<typeof AnalyticsService>;
  rubrics: Client<typeof RubricService>;
  talent: Client<typeof TalentService>;
  // Wired 2026-06-21 (per FE handoff) ↓
  coding: Client<typeof CodingService>;
  companyProfile: Client<typeof CompanyProfileService>;
  discovery: Client<typeof DiscoveryService>;
  jobAlerts: Client<typeof JobAlertsService>;
  messaging: Client<typeof MessagingService>;
  notification: Client<typeof NotificationService>;
  observability: Client<typeof ObservabilityService>;
  preferences: Client<typeof PreferencesService>;
  savedJobs: Client<typeof SavedJobsService>;
  scheduling: Client<typeof SchedulingService>;
  settings: Client<typeof SettingsService>;
  sourcing: Client<typeof SourcingService>;
  team: Client<typeof TeamService>;
}

/** ai-agents clients — live on a separate transport (NEXT_PUBLIC_AIAGENTS_URL). */
export interface AiAgentsClients {
  interview: Client<typeof InterviewService>;
  chat: Client<typeof ChatService>;
  jd: Client<typeof JdService>;
  // Wired 2026-06-21 — practice moved REST → gRPC (ai-agents transport).
  practice: Client<typeof PracticeService>;
}

/** The full client set apps consume via `useAuth().api` — admin + ai-agents combined. */
export type ApiClients = AdminClients & AiAgentsClients;

/**
 * Build the full set of admin clients over one gRPC-web transport.
 * `getToken` (optional) supplies the candidate/recruiter access token per request.
 */
/** Build the admin clients over an existing transport (e.g. one with a refresh interceptor). */
export function clientsFromTransport(transport: Transport): AdminClients {
  return {
    auth: createClient(AuthService, transport),
    jobs: createClient(JobService, transport),
    applications: createClient(ApplicationService, transport),
    aptitude: createClient(AptitudeService, transport),
    decisions: createClient(DecisionService, transport),
    profile: createClient(ProfileService, transport),
    reports: createClient(ReportService, transport),
    compliance: createClient(ComplianceService, transport),
    recommendations: createClient(RecommendationService, transport),
    analytics: createClient(AnalyticsService, transport),
    rubrics: createClient(RubricService, transport),
    talent: createClient(TalentService, transport),
    coding: createClient(CodingService, transport),
    companyProfile: createClient(CompanyProfileService, transport),
    discovery: createClient(DiscoveryService, transport),
    jobAlerts: createClient(JobAlertsService, transport),
    messaging: createClient(MessagingService, transport),
    notification: createClient(NotificationService, transport),
    observability: createClient(ObservabilityService, transport),
    preferences: createClient(PreferencesService, transport),
    savedJobs: createClient(SavedJobsService, transport),
    scheduling: createClient(SchedulingService, transport),
    settings: createClient(SettingsService, transport),
    sourcing: createClient(SourcingService, transport),
    team: createClient(TeamService, transport),
  };
}

/** Build the ai-agents clients over an existing transport (separate origin, shared store). */
export function aiAgentsClientsFromTransport(transport: Transport): AiAgentsClients {
  return {
    interview: createClient(InterviewService, transport),
    chat: createClient(ChatService, transport),
    jd: createClient(JdService, transport),
    practice: createClient(PracticeService, transport),
  };
}

export function createApiClients(
  baseUrl: string,
  getToken?: () => string | null | undefined,
): AdminClients {
  return clientsFromTransport(
    createGrpcWebTransport({
      baseUrl,
      interceptors: getToken ? [authInterceptor(getToken)] : [],
    }),
  );
}
