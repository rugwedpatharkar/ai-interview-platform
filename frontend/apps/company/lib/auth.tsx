"use client";

import { makeAuth } from "@ip/shared";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
const AIAGENTS_URL = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081";

// One auth context; `api` carries both admin and ai-agents (chat/jd) gRPC clients over
// transports sharing this store. Company registration needs a company name, so the
// register screen calls registerCompany + login directly — no `register` config here.
export const { AuthProvider, useAuth, store } = makeAuth({
  baseUrl: ADMIN_URL,
  aiAgentsBaseUrl: AIAGENTS_URL,
  namespace: "company",
});
