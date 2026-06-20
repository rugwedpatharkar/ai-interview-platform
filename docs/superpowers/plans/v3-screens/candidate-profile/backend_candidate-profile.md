# Backend — Candidate profile

> **Screen:** Candidate profile editor — résumé upload + AI parse + general recruiting profile.
> **FE consumer:** `frontend_candidate-profile.md`.
> **Status:** **EXISTING — reuse v2.** Source: `../v2-screens/candidate-profile.md`. The v3 work is an
> **appearance-only reskin** — no proto delta, no new RPC.
> **Real-vs-mock today:** `ProfileService` (gRPC-web over `admin`) is **real** — all three RPCs ship, including the
> server-side `completeness` computation and the async résumé-parse pipeline. The reskin binds to the same calls.
> **Data scope:** general recruiting profile ONLY (name/age/location/prefs/skills/experience/education/résumé) — **no
> sensitive or official documents** are read or written.

## Functionalities
- **Get** the caller's profile (or `NotFound` → `null` for a fresh user).
- **Update** the caller's profile (basics + skills + experience + education); server **recomputes `completeness`**.
- **Upload résumé** bytes → kicks off the async AI parse; FE polls `getProfile` until `parsed` flips true.

## Service & RPCs (gRPC-web; `admin` `ProfileService`, candidate-scoped — subject from bearer token)
| Function | RPC | Auth/scope |
|---|---|---|
| Get profile | `api.profile.getProfile({})` → `Profile` (or `NotFound`) | bearer, candidate; own only |
| Update profile | `api.profile.updateProfile({ fullName, age, location, willingToRelocate, jobPreference, experience, education, skills })` → updated `Profile` | bearer, candidate; own only |
| Upload résumé | `api.profile.uploadResume({ data: Uint8Array, contentType: string })` → ack | bearer, candidate; own only |

> **No new RPC.** The completeness meter renders the **existing** `completeness` int. Optional EXTEND (render-if-present,
> **not required**): expose `resumeFilename` on the profile message so ParsedBanner shows the real filename.

## Request / Response structures (camelCase per protobuf-es on the FE)
```ts
// profile.getProfile({}) →  (NotFound → page maps to null)
interface Profile {
  fullName: string;
  age: number;
  location: string;
  willingToRelocate: boolean;
  jobPreference: string;
  skills: string[];
  experience: { company: string; title: string; summary: string }[];
  education: { institution: string; degree: string; year: string }[];
  resumeUploaded: boolean;     // a résumé file has been received
  parsed: boolean;             // async AI parse completed
  completeness: number;        // 0–100 int (server-computed; the meter renders this)
  resumeFilename?: string;     // optional EXTEND — render-if-present (else "Your résumé")
}

// profile.updateProfile({ fullName, age, location, willingToRelocate, jobPreference,
//   experience: {company,title,summary}[], education: {institution,degree,year}[], skills: string[] })
//   → updated Profile (page invalidates ["profile"] and re-reads; server recomputes completeness)

// profile.uploadResume({ data: Uint8Array, contentType: string }) → ack
//   (page invalidates ["profile"] and polls getProfile every ~2.5s, capped at MAX_PARSE_POLLS, until parsed === true)
```
- **FE mock shape:** none new — binds to the **existing** `api.profile.*` (real today). The reskin is presentational
  over data already flowing.

## Data required
- **Read/write:** the candidate profile collection (caller-scoped): basics, `skills[]`, `experience[]`, `education[]`,
  `resumeUploaded`, `parsed`, `completeness` (server-computed), optional `resumeFilename`.
- **Pipeline:** the résumé-parse pipeline (already built) consumes the uploaded bytes, extracts experience/education/
  skills, and flips `parsed`; `completeness` recomputed on update + parse.
- **Indexes:** none new (profile keyed by candidate id).

## Errors & edge cases
- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate → `PERMISSION_DENIED`.
- **Fresh profile:** `getProfile` → `NotFound` → FE renders an empty form + "upload your résumé" banner (mapped via `isNotFound`).
- **Upload validation:** MIME/size is checked at the FE boundary (`onFile`) AND the servicer; bad type → `InvalidArgument`.
- **Parse stall:** poll cap (`MAX_PARSE_POLLS`) reached without `parsed` → FE `.pill-warn`/stalled alert (re-upload to retry).
- **Transport error:** → FE `ErrorState`.

## Cross-references
- Restates `../v2-screens/candidate-profile.md`.
- Data-scope guardrail: general recruiting profile only (no official/sensitive documents) — per the candidate
  data-scope standard.
