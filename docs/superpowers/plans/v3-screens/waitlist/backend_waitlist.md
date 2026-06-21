# Waitlist — Backend contract (v3 · frozen)

> **Screen.** Public candidate-side waitlist intake form. **FE consumer:** [`frontend_waitlist.md`](./frontend_waitlist.md).
> **Status:** `NEW — minimal forms-intake scope · contract surface TBD with the backend session today, mailto fallback ships immediately.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Today (mailto fallback):** the form submission seam (`submitWaitlist()` in
  `@ip/api-client/forms`) opens a `mailto:waitlist@aptura.ai?subject=Waitlist&body=…` with the
  typed answers url-encoded. Returns `{ ok: true }` synchronously after window-location open; the
  FE switches to the success state.
- **Tomorrow (RPC TBD):** the seam's implementation flips to a real backend call. The FE
  component does not change. The contract surface below is the minimum the backend session needs
  to land; exact RPC name / transport (gRPC `forms.submitWaitlist` vs. REST
  `POST /api/forms/waitlist`) is the backend session's call.
- **In-page-load fetches:** none. The page renders entirely from `content.ts`.
- **Outbound cross-links** to `/privacy`, `/trust`, `/sample-report`, `/jobs`, `/`.

## Service & RPCs

- **Today:** no RPC. The form opens a `mailto:` (a static `<a href="mailto:…">` is the
  zero-JS fallback; the form's submit handler builds the same URL with the typed answers).
- **Tomorrow — minimum required contract surface:**

  | Field | Required | Notes |
  |---|---|---|
  | Endpoint | — | `forms.submitWaitlist` (gRPC-web) OR `POST /api/forms/waitlist` (REST). Backend session's call. |
  | Auth | — | **Public — token-free.** Subject to bot-protection (Turnstile / hCaptcha) — backend session's call. |
  | Rate limit | — | Per-IP + per-email; 5 submissions / hour / IP. |
  | Idempotency | — | Same `email` returns `ok: true` without re-sending notifications; allow `roleArea` to be updated by a subsequent submission within the same week. |
  | Success | — | Returns `{ ok: true, ref?: string }`. |
  | Error | — | Returns `{ ok: false, code: "VALIDATION"|"RATE_LIMITED"|"INTERNAL", message: string }`. |
  | Side effect | — | Persists to a `waitlist_signups` collection; subscribes to a "candidate waitlist" mailing list (Postmark / Resend / etc. — backend session's call). **Does NOT create a user account.** |
  | Unsubscribe | — | A one-click unsubscribe link is delivered with every email — the link target is a backend `GET /api/forms/waitlist/unsubscribe?token=…` (or equivalent) that flips a `subscribed: false` flag. Out-of-scope for this FE plan; in-scope for the contract. |

## Request / Response structures

```ts
// Sent from the FE (today: as the mailto body, url-encoded; tomorrow: as JSON / proto)
interface WaitlistFormDTO {
  email: string                                  // required; RFC-5322
  roleArea: "engineering" | "product" | "design" | "data" | "sales" | "marketing"
          | "customer_success" | "people_ops" | "finance" | "other"
  consent: true                                  // required; must be literally true
  captchaToken?: string                          // added by FE when backend session lands it
  source?: "landing" | "footer" | "direct"
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string }
}

// Today (mailto fallback): returns synchronously after window-location open
type WaitlistSubmitSuccess = { ok: true; ref?: undefined }

// Tomorrow (RPC):
type WaitlistSubmitResponse =
  | { ok: true; ref?: string }
  | { ok: false; code: "VALIDATION"|"RATE_LIMITED"|"INTERNAL"; message: string }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- The `<WaitlistSuccess />` panel MUST NOT say "You're #N on the waitlist" unless we actually
  compute and display the number — and we don't pre-launch. Truthful copy only.
- The reassurance band's "No spam · Unsubscribe in one click · Every applicant gets an answer"
  chips MUST remain truthful; the unsubscribe link is mandatory by the contract above.
- The success body MAY interpolate the chosen `roleArea` ("We'll email you when an engineering
  role is listed") — this is truthful and is the entire reason the field exists.

## Data required

- **Today:** none. The mailto fallback writes to no collection.
- **Tomorrow (RPC):** one new collection `waitlist_signups`:

  ```ts
  interface WaitlistSignupDoc {
    _id: ObjectId
    email: string
    emailDomain: string                          // derived index
    roleArea: string
    consentAtIso: string
    captchaScore?: number
    source?: string
    utm?: object
    submittedAtIso: string
    subscribed: boolean                          // true on insert; false after unsubscribe
    unsubscribeToken: string                     // opaque, single-use-ish; new token on every email
    notifiedAtIso?: string
  }
  ```
  Indexes: `{ submittedAtIso: -1 }`, `{ roleArea: 1, submittedAtIso: -1 }`, unique
  `{ email: 1 }` to enforce idempotency at the DB level. The `unsubscribeToken` is rotated
  every time a notification is sent.

- **Today and tomorrow:** no PII other than email + role-area. We **do not** collect IP,
  user-agent, or referrer beyond optional `source` / `utm` (and only with cookie-consent
  approval — see the privacy-policy page Tier 2 plan).

## Errors & edge cases

- **Today (mailto):** if `window.location.href = mailto:…` fails (no configured mail client), the
  visible "Or email us →" ghost button has the same `mailto:` href as its `<a>` — user can copy
  it manually. We can't observe success; success state is optimistic.
- **Tomorrow (RPC):**
  - `VALIDATION` (4xx) — duplicate idempotency hit returns success; missing required field
    returns `VALIDATION` with `message` naming the field.
  - `RATE_LIMITED` (429) — friendly retry-after.
  - `INTERNAL` (5xx) — generic "Please email waitlist@aptura.ai directly" fallback.
  - Bot-protection failure — same as `VALIDATION`.
- **No PII leakage** in the URL bar — the FE uses `replaceState` after the success transition.
- **Public, token-free, crawlable:** the page is indexable; the form endpoint (tomorrow) is NOT
  crawlable (POST-only).

## Cross-references

- Sibling forms surface: [`../request-pilot/backend_request-pilot.md`](../request-pilot/backend_request-pilot.md)
  (same contract shape, company side; first to introduce `@ip/api-client/forms`).
- Marketplace cross-link: `discovery.searchJobs` / `GET /public/jobs` — see the marketplace plan.
- Privacy policy (cross-linked in consent): Tier 2 plan `privacy-policy` (next wave).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
