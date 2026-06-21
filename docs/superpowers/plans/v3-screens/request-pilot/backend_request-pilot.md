# Request a Pilot — Backend contract (v3 · frozen)

> **Screen.** Public company-side pilot intake form. **FE consumer:** [`frontend_request-pilot.md`](./frontend_request-pilot.md).
> **Status:** `NEW — minimal forms-intake scope · contract surface TBD with the backend session today, mailto fallback ships immediately.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Today (mailto fallback):** the form submission seam (`submitPilot()` in `@ip/api-client/forms`)
  opens a `mailto:pilot@aptura.ai?subject=Pilot%20request&body=…` with the typed answers
  url-encoded into the body. Returns `{ ok: true }` synchronously after the window-location open;
  the FE switches to the success state.
- **Tomorrow (RPC TBD):** the seam's implementation flips to a real backend call. The FE
  component does not change. The contract surface below is the minimum the backend session needs
  to land; the exact RPC name / transport (gRPC `forms.submitPilot` vs. REST
  `POST /api/forms/pilot`) is the backend session's call.
- **In-page-load fetches:** none. The page renders entirely from `content.ts`.
- **Outbound cross-links** to `/privacy`, `/trust`, `/sample-report`, `/`.

## Service & RPCs

- **Today:** no RPC. The form opens a `mailto:` (a static `<a href="mailto:…">` is the
  zero-JS fallback; the form's submit handler builds the same URL with the typed answers).
- **Tomorrow — minimum required contract surface** (the backend session owns the final shape;
  these are the requirements the FE will hit):

  | Field | Required | Notes |
  |---|---|---|
  | Endpoint | — | RPC name `forms.submitPilot` (gRPC-web) **OR** `POST /api/forms/pilot` (REST). Backend session's call. |
  | Auth | — | **Public — token-free.** Subject to bot-protection (Turnstile / hCaptcha) — backend session's call. |
  | Rate limit | — | Per-IP + per-email; 5 submissions / hour / IP. Backend session's call. |
  | Idempotency | — | Same `(email, role, company)` within 24h returns `ok: true` without re-sending notifications. |
  | Success | — | Returns `{ ok: true, ref?: string }`. `ref` is an opaque ticket id the FE shows in `<PilotSuccess />` if returned. |
  | Error | — | Returns `{ ok: false, code: "VALIDATION"|"RATE_LIMITED"|"INTERNAL", message: string }`. FE shows the message in `<FieldError />`. |
  | Side effect | — | Persists the submission to a `pilot_intake` collection; notifies `pilot@aptura.ai` (mail) and/or a Slack webhook. **Does NOT create a workspace or user account.** |

## Request / Response structures

```ts
// Sent from the FE (today: as the mailto body, url-encoded; tomorrow: as JSON / proto)
interface PilotFormDTO {
  email: string                        // required; RFC-5322; work-email soft-warn on FE
  companyName: string                  // required; trimmed; min 2 chars
  yourName: string                     // required; trimmed; min 2 chars
  yourRole: "hiring_manager"
          | "talent_recruiting"
          | "founder_ceo"
          | "people_ops"
          | "engineering_lead"
          | "other"
  rolePiloting: string                 // required; trimmed; min 2 chars
  teamSize?: "1-10" | "11-50" | "51-200" | "201-1000" | "1000+"
  startWhen?: "this_month" | "next_month" | "this_quarter" | "exploring"
  solving?: string                     // optional; 0–500 chars
  consent: true                        // required; must be literally true
  // Bot-protection token added by the FE when the backend session lands it:
  captchaToken?: string
  // Optional FE-set metadata; backend stores but does not echo:
  source?: "landing" | "footer" | "direct"
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string }
}

// Today (mailto fallback): returns synchronously after window-location open
type PilotSubmitSuccess = { ok: true; ref?: undefined }

// Tomorrow (RPC): returns from the server
type PilotSubmitResponse =
  | { ok: true; ref?: string }
  | { ok: false; code: "VALIDATION"|"RATE_LIMITED"|"INTERNAL"; message: string }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- The `<PilotSuccess />` panel MUST say truthful next-steps; no fake "Your dedicated account
  manager will reach out in 4 hours" SLAs we can't honour.
- The `BRIEF` lead copy MUST NOT promise outcomes ("Hire 10x faster" — banned). It describes
  what a pilot includes, period.
- No fabricated `Trusted by` line.

## Data required

- **Today:** none. The mailto fallback writes to no collection.
- **Tomorrow (RPC):** one new collection `pilot_intake`:

  ```ts
  interface PilotIntakeDoc {
    _id: ObjectId
    email: string
    emailDomain: string                // derived index (e.g. "acme.com")
    companyName: string
    yourName: string
    yourRole: string
    rolePiloting: string
    teamSize?: string
    startWhen?: string
    solving?: string
    consentAtIso: string
    captchaScore?: number
    source?: string
    utm?: object
    submittedAtIso: string
    notifiedAtIso?: string             // set when ops notification fires
    status: "new" | "triaged" | "scheduled" | "won" | "lost" | "spam"
  }
  ```
  Indexes: `{ submittedAtIso: -1 }`, `{ emailDomain: 1, submittedAtIso: -1 }`, unique
  `{ email: 1, rolePiloting: 1 }` to enforce 24h idempotency at the DB level.

- **Today and tomorrow:** no PII other than the form fields above; we **do not** collect IP,
  user-agent, or referrer beyond the optional `source` / `utm` the FE may attach (and only if a
  cookie-consent banner has approved analytics — the FE plan's privacy-policy link covers this).

## Errors & edge cases

- **Today (mailto):** if `window.location.href = mailto:…` fails (no configured mail client), the
  visible "Or email us directly →" ghost button has the same `mailto:` href as its `<a>` — the
  user can copy it manually. We can't observe success; the success state is shown optimistically.
- **Tomorrow (RPC):**
  - `VALIDATION` (4xx) — duplicate idempotency hit returns success; missing required field returns
    `VALIDATION` with `message` naming the field.
  - `RATE_LIMITED` (429) — friendly retry-after message in the FE error.
  - `INTERNAL` (5xx) — generic "Something went wrong — please email pilot@aptura.ai directly"
    fallback; the visible mailto button stays available.
  - Bot-protection failure — same as `VALIDATION`.
- **No PII leakage** in the URL bar — the FE uses `replaceState` after the success transition
  so the typed answers don't end up in browser history.
- **Public, token-free, crawlable:** the page itself is indexable; the form endpoint (tomorrow)
  is NOT crawlable (POST-only, no GET).

## Cross-references

- Sibling forms surface: [`../waitlist/backend_waitlist.md`](../waitlist/backend_waitlist.md)
  (same contract shape, candidate side).
- Public framing context: [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md),
  [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md).
- Privacy policy (cross-linked in consent): Tier 2 plan `privacy-policy` (next wave).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
