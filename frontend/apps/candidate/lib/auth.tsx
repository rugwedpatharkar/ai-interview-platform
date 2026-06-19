"use client";

import { makeAuth } from "@ip/shared";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
const AIAGENTS_URL = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081";

// One auth context; `api` carries both admin (auth/jobs/...) and ai-agents
// (interview/chat) gRPC clients over transports that share this token store.
export const { AuthProvider, useAuth, store } = makeAuth({
  baseUrl: ADMIN_URL,
  aiAgentsBaseUrl: AIAGENTS_URL,
  namespace: "candidate",
  register: (api, email, password) =>
    api.auth.registerCandidate({ email, password }),
});
