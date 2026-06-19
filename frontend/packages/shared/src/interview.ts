// Live interview lives on ai-agents' REST API (NOT gRPC-web). Uses authedFetch so an
// access-token expiry mid-session silently refreshes + retries (against the admin origin)
// instead of hard-failing with a 401.
import { authedFetch, restAuthFor } from "./authed-fetch.js";
import { HttpError } from "./errors.js";
import type { TokenStore } from "./tokens.js";

export interface InterviewTurn {
  done: boolean;
  question: string;
}

export function makeInterviewClient(baseUrl: string, store: TokenStore) {
  const auth = restAuthFor(store);
  async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await authedFetch(
      `${baseUrl}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      auth,
      signal,
    );
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new HttpError(res.status, errBody?.detail ?? `Request failed (${res.status})`, errBody?.detail);
    }
    const data = await res.json().catch(() => {
      throw new HttpError(502, "Malformed response from server");
    });
    return data as T;
  }

  return {
    start: (applicationId: string, signal?: AbortSignal) =>
      post<{ question: string }>(`/interview/${applicationId}/start`, undefined, signal),
    turn: (applicationId: string, answer: string, signal?: AbortSignal) =>
      post<InterviewTurn>(`/interview/${applicationId}/turn`, { answer }, signal),
  };
}
