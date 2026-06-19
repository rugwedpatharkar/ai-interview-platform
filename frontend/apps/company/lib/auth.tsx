"use client";

import { createChatClient, createJdClient, makeAuth } from "@ip/shared";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
const AIAGENTS_URL = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081";

// Company registration needs a company name, so the register screen calls
// registerCompany + login directly — no `register` config here.
export const { AuthProvider, useAuth, store } = makeAuth({
  baseUrl: ADMIN_URL,
  namespace: "company",
});

/** Recruiting-assistant chat (ai-agents SSE), sharing the recruiter's token store. */
export const chat = createChatClient(AIAGENTS_URL, store);

/** "Improve JD" client (ai-agents REST), sharing the recruiter's token store. */
export const jd = createJdClient(AIAGENTS_URL, store);
