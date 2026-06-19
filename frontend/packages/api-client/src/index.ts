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
import { ComplianceService } from "./gen/compliance_pb.js";
import { DecisionService } from "./gen/decision_pb.js";
import { JobService } from "./gen/job_pb.js";
import { ProfileService } from "./gen/profile_pb.js";
import { RecommendationService } from "./gen/recommendation_pb.js";
import { ReportService } from "./gen/report_pb.js";
import { RubricService } from "./gen/rubric_pb.js";
import { TalentService } from "./gen/talent_pb.js";
// ai-agents services (interview/chat/jd) — same gRPC-web translator, different origin.
import { ChatService } from "./gen/chat_pb.js";
import { InterviewService } from "./gen/interview_pb.js";
import { JdService } from "./gen/jd_pb.js";

// Re-export every generated message type + schema so apps import them from one place.
export * from "./gen/analytics_pb.js";
export * from "./gen/application_pb.js";
export * from "./gen/aptitude_pb.js";
export * from "./gen/auth_pb.js";
export * from "./gen/compliance_pb.js";
export * from "./gen/decision_pb.js";
export * from "./gen/job_pb.js";
export * from "./gen/profile_pb.js";
export * from "./gen/recommendation_pb.js";
export * from "./gen/report_pb.js";
export * from "./gen/rubric_pb.js";
export * from "./gen/talent_pb.js";
export * from "./gen/chat_pb.js";
export * from "./gen/interview_pb.js";
export * from "./gen/jd_pb.js";

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
}

/** ai-agents clients — live on a separate transport (NEXT_PUBLIC_AIAGENTS_URL). */
export interface AiAgentsClients {
  interview: Client<typeof InterviewService>;
  chat: Client<typeof ChatService>;
  jd: Client<typeof JdService>;
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
  };
}

/** Build the ai-agents clients over an existing transport (separate origin, shared store). */
export function aiAgentsClientsFromTransport(transport: Transport): AiAgentsClients {
  return {
    interview: createClient(InterviewService, transport),
    chat: createClient(ChatService, transport),
    jd: createClient(JdService, transport),
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
