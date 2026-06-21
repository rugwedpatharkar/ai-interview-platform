# Candidate profile — Backend contract (v3 · frozen)

> **Screen.** Candidate profile editor — résumé upload + AI parse + general recruiting profile. **FE consumer:** [`frontend_candidate-profile.md`](./frontend_candidate-profile.md).
> **Status:** `EXISTING — reuse v2` · no proto delta, no new RPC, no new collections, no new events.
> **Real-vs-mock today:** `ProfileService` (gRPC-web over `admin`) is **real** — all three RPCs ship, including the server-side `completeness` computation and the async résumé-parse pipeline. The v3 work is a **complete UI rebuild** (Aperture Pro design language); the backend contract documented here is **frozen**.
> **Data scope:** general recruiting profile ONLY (name / age / location / prefs / skills / experience / education / résumé) — **no sensitive or official documents** are read or written.
> **Anti-fiction reminder:** Empty / hint states must use generic phrasing — no fake employer names or fabricated parse summaries. See [`_design-language.md`](../_design-language.md).

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

> **No new RPC.** The `.ring` completeness gauge renders the **existing** `completeness` int. Optional EXTEND (render-if-present, **not required**): expose `resumeFilename` on the profile message so the résumé cell shows the real filename (absent → falls back to "Your résumé").

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
  completeness: number;        // 0–100 int (server-computed; the ring renders this)
  resumeFilename?: string;     // optional EXTEND — render-if-present (else "Your résumé")
}

// profile.updateProfile({ fullName, age, location, willingToRelocate, jobPreference,
//   experience: {company,title,summary}[], education: {institution,degree,year}[], skills: string[] })
//   → updated Profile (page invalidates ["profile"] and re-reads; server recomputes completeness)

// profile.uploadResume({ data: Uint8Array, contentType: string }) → ack
//   (page invalidates ["profile"] and polls getProfile every ~2.5s, capped at MAX_PARSE_POLLS, until parsed === true)
```

- **FE mock shape:** none new — binds to the **existing** `api.profile.*` (real today). The rebuild is presentational over data already flowing.

## Data required

- **Read/write:** the candidate profile collection (caller-scoped): basics, `skills[]`, `experience[]`, `education[]`, `resumeUploaded`, `parsed`, `completeness` (server-computed), optional `resumeFilename`.
- **Pipeline:** the résumé-parse pipeline (already built) consumes the uploaded bytes, extracts experience / education / skills, and flips `parsed`; `completeness` recomputed on update + parse.
- **Indexes:** none new (profile keyed by candidate id).

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate → `PERMISSION_DENIED`.
- **Fresh profile:** `getProfile` → `NotFound` → FE renders an empty editor + a `.pill-coral` "Upload your résumé to get started" prompt (mapped via `isNotFound`).
- **Upload validation:** MIME / size is checked at the FE boundary (`onFile`) AND the servicer; bad type → `INVALID_ARGUMENT`.
- **Parse stall:** poll cap (`MAX_PARSE_POLLS`) reached without `parsed` → FE `.pill-warn` "Parse stalled — re-upload to retry".
- **Transport error:** → FE `ErrorState`.

## Cross-references

- Restates: v2 `../v2-screens/candidate-profile.md`.
- Data-scope guardrail: general recruiting profile only (no official / sensitive documents) — per the candidate data-scope standard.
- Design language: [`../_design-language.md`](../_design-language.md). Reference demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
