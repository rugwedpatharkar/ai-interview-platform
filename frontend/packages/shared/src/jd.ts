// "Improve JD" lives on ai-agents' REST API (unary JSON, Bearer token). Sends a recruiter
// brief/draft, returns a polished JD plus suggestions. Uses authedFetch so an access-token
// expiry refreshes + retries instead of hard-failing with a 401.
import { authedFetch, restAuthFor } from "./authed-fetch.js";
import { HttpError } from "./errors.js";
import type { TokenStore } from "./tokens.js";

export interface JdDraft {
  jd_text: string;
  suggestions: string[];
}

export function createJdClient(baseUrl: string, store: TokenStore) {
  const auth = restAuthFor(store);
  async function improve(brief: string, signal?: AbortSignal): Promise<JdDraft> {
    const res = await authedFetch(
      `${baseUrl}/jd/improve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      },
      auth,
      signal,
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new HttpError(res.status, body?.detail ?? `Request failed (${res.status})`, body?.detail);
    }
    const data = await res.json().catch(() => {
      throw new HttpError(502, "Malformed response from server");
    });
    return data as JdDraft;
  }

  return { improve };
}
