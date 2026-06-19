"use client";

import {
  createChatClient,
  createProctorClient,
  makeAuth,
  makeInterviewClient,
} from "@ip/shared";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
const AIAGENTS_URL = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081";

export const { AuthProvider, useAuth, store } = makeAuth({
  baseUrl: ADMIN_URL,
  namespace: "candidate",
  register: (api, email, password) =>
    api.auth.registerCandidate({ email, password }),
});

/** Live-interview REST client (ai-agents), sharing the candidate's token store. */
export const interview = makeInterviewClient(AIAGENTS_URL, store);

/** Recruiting-assistant chat (ai-agents SSE), sharing the candidate's token store. */
export const chat = createChatClient(AIAGENTS_URL, store);

/** On-device proctoring signal sink (ai-agents REST), sharing the candidate's token. */
export const proctor = createProctorClient(AIAGENTS_URL, store);
