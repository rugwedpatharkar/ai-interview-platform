# Candidate frontend audit — 2026-07-28

Static audit of every route under `frontend/apps/candidate/app/**`. Findings from 8 parallel route-group agents.

**Totals:** 105 findings — 4 P0, 35 P1, 40 P2, 26 P3.

Grouped by severity, then route group. Every finding names a file + line + concrete fix.

## P0-blocker

### Post-a-job silently drops location, salary, remote/employment, and gate fields

`frontend/apps/candidate/app/company/jobs/new/page.tsx:57` — `correctness` · effort `S` · group `company-recruiter`

**Detail.** createJob is called with { title, jdText, skills } only, yet the form collects city/region/country/remoteMode/employmentType/salaryMin/salaryMax/salaryCurrency/gateMode. The generated proto (job_pb.ts lines 129-201) declares every one of these as fields on CreateJobRequest, and the onboarding page already sends them. So a recruiter who fills the whole form gets a job that has none of its marketplace metadata — the candidate-facing job card will show no location, no salary, no remote mode, and gate policy silently defaults on the server.

**Fix.** Extend the mutation body to include the collected fields (with BigInt coercion for salary and empty-string fallbacks that match EMPTY_JOB_FORM), mirroring the pattern in onboarding/page.tsx and jobs/[id]/edit/page.tsx updateJob call.

### Applicant Advance decision calls overrideGate instead of an advance RPC

`frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:206` — `correctness` · effort `S` · group `company-recruiter`

**Detail.** decide.mutate({ action: 'advance' }) runs api.decisions.overrideGate({ applicationId: appId }) regardless of state. overrideGate is defined semantically for gated_out applicants (see the same RPC used behind the Override gate button in jobs/[id]/page.tsx line 106). Clicking Advance from the report of an assessment_review, scored, or interviewed candidate will emit a gate-override event — corrupt audit trail and probably a server-side no-op or error. On top of that, the ConfirmDialog copy claims the candidate is notified, but overrideGate does not send a candidate notification.

**Fix.** Use the proper decision RPC for advancing (equivalent to holdApplication/rejectApplication — likely advanceApplication; if the RPC is missing, wire the correct one and route overrideGate behind a separate button only for state === 'gated_out'). Update dialog copy to match actual side effects.

### Hold/reject decisions never collect a reason but audit contract requires one

`frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:449` — `missing-feature` · effort `M` · group `company-recruiter`

**Detail.** The mutation signature accepts reasonCode and freeText, and the RPC contract (holdApplication/rejectApplication) forwards them into the decision audit log. But the three ConfirmDialogs at lines 437/449/462 invoke decide.mutate({ action }) with no fields, so every hold defaults to reasonCode: 'other' with empty text, and every reject the same. The Audit page then shows a reasonSnippet of — for every decision, defeating the 'every decision, on the record' promise the app UI states at line 96 of audit/page.tsx and again at line 424 here.

**Fix.** Replace the raw ConfirmDialog for Hold and Decline with a two-step dialog that requires a reasonCode select (from the existing holdApplication/rejectApplication reason enum) and an optional freeText textarea. Only enable the confirm button when a reason is chosen.

### Onboarding step 1 overwrites parsed resume skills with at most 6 interest chips

`frontend/apps/candidate/app/onboarding/page.tsx:254` — `correctness` · effort `S` · group `onboarding-profile-account` **[needs BE]**

**Detail.** The seed effect fills `data.interests` from `p.skills.slice(0, 6)` (line 163), and `advance()` step 1 calls `save.mutateAsync({ skills: data.interests })` which the mutation forwards as `skills: patch.skills ?? p?.skills ?? []` (line 199). Because `patch.skills` is defined it always wins, so a candidate with, say, 20 resume-parsed skills who re-enters the wizard (deep link, refresh past step 1, or comes back from `/profile`) has their entire skills list rewritten to just the 6 chips the wizard showed. This is silent, unbounded data loss on the profile's core matching field.

**Fix.** Do not overload `skills` with interests. Either (a) persist interests to a separate `interests` profile field, or (b) merge — `skills: Array.from(new Set([...(p?.skills ?? []), ...data.interests]))` — and drop the `.slice(0, 6)` cap in the seed.

## P1-major

### Chat composer is a single-line <Input>, so multi-line messages are impossible

`frontend/packages/ui/src/message-thread-view.tsx:182` — `ux` · effort `S` · group `applications-messaging`

**Detail.** The composer used by both /messages/[applicationId] and the /applications/[id] Messages tab renders `<Input value={input} maxLength={maxBody} … />` — a single-line HTML input. MAX_BODY is 4096 chars (server cap), but the input flattens pasted newlines and offers no way to type them. There is also no `onKeyDown` for Enter/Shift-Enter — Enter submits via native form submission, and there is no path to insert a break. Candidates writing a paragraph-length reply (rescore request, follow-up question, timezone details) get one long horizontal line with no visual structure.

**Fix.** Swap the `Input` for the existing `Textarea` primitive with rows=2 auto-grow, and add `onKeyDown` where plain Enter calls submit() and Shift+Enter inserts a newline. `whitespace-pre-wrap` is already on the bubble, so multi-line content will render correctly once the composer can produce it.

### Outcome page polls every 3s forever on 404 — no cap, no exit for gated_out

`frontend/apps/candidate/app/applications/[id]/outcome/page.tsx:124` — `performance` · effort `S` · group `applications-messaging`

**Detail.** `refetchInterval` returns 3000 whenever the error is `isNotFound` or `isTransient`, with no counter and no `refetchIntervalInBackground: false` (default false, so hidden-tab polling is off, but focused-tab polling is unbounded). For a `gated_out` candidate `api.reports.getReport` will 404 permanently (no interview happened, no report exists), yet /applications/[id]/labelForEvent tells them to 'see your outcome' — landing here yields the 'not published yet' alert plus a poll that fires ~20 calls/min for the full session. A candidate leaves the tab open on a coffee break and the FE hammers the reports endpoint for hours.

**Fix.** Cap the retries via a ref counter (`if (attempts > N) return false;`) and give up after ~5 minutes with an explicit 'still not ready — check back later' state. Better: gate the polling on `TERMINAL_STATES` — if the application's known state is `gated_out`/`withdrawn`/`expired`, don't poll at all and show a matching 'no interview outcome for this application' copy.

### gated_out timeline says 'see your outcome' but renders no CTA and no link

`frontend/apps/candidate/app/applications/[id]/page.tsx:462` — `correctness` · effort `M` · group `applications-messaging`

**Detail.** `labelForEvent` returns 'Didn\'t pass the threshold — see your outcome.' for `gated_out` at the aptitude step (line 444) and 'Stopped at the aptitude step — see your outcome.' at the outcome step (line 462). But `reportPublished` (line 199) is `scored | shortlisted | hired | rejected` only, so `gated_out` gets no 'View your outcome' button, no Report tab, and no working link anywhere. Text points at a page the UI refuses to link to; if a candidate manually navigates they land on the infinite-poll 404 (finding above). Same broken promise applies to `expired`/`withdrawn`/`abandoned` (labels reference terminal messaging but nothing is reachable).

**Fix.** Either (a) add `gated_out` to `reportPublished` and let the outcome page render a dignified 'stopped at aptitude' verdict from the application state alone (no reports RPC needed), or (b) rewrite the labelForEvent copy so it stops promising an outcome page that isn't there. The former is the no-ghosting story; the latter is the 5-line fix.

### RescoreDialog silently swallows clipboard failure — button lies to the candidate

`frontend/apps/candidate/app/applications/[id]/outcome/page.tsx:439` — `error-handling` · effort `M` · group `applications-messaging`

**Detail.** The 'Copy & open messages' button (line 449) wraps `navigator.clipboard.writeText(reason.trim())` in `try {} catch {}` and then navigates to /messages/[id] regardless of success. On any browser where clipboard API is unavailable (non-HTTPS local, older Safari, some embedded webviews) or where permission is denied, the candidate lands on an empty message thread with no draft, no clipboard payload, and no idea that the copy failed — after they just typed a >=10-char justification. On the exact appeal path where the surface is supposed to preserve dignity, we lose their words.

**Fix.** Pass the draft to /messages/[id] via `router.push({ pathname: \`/messages/${applicationId}\`, query: { draft: reason.trim() } })` (or sessionStorage) and have the thread page hydrate the composer from it. Alternatively toast on clipboard failure and keep the dialog open so the candidate can select+copy manually.

### Interview self-view video never gets srcObject — empty tile for whole session

`frontend/apps/candidate/app/interview/[applicationId]/page.tsx:184` — `correctness` · effort `S` · group `assessments-interview`

**Detail.** In `onReady`, `if (selfViewRef.current) { selfViewRef.current.srcObject = media; selfViewRef.current.volume = 0; }` runs BEFORE `setPhase("live")`. The `<video ref={selfViewRef}>` element is only rendered inside the `phase === "live"` branch (line ~333), so at the moment onReady runs the ref is null and the guard falls through. After `setPhase("live")` mounts the video, no code re-attaches the stream — the candidate stares at a black self-view tile for the entire proctored session, defeating the point of a self-view and eroding trust in the room. Local audio-mute-to-avoid-echo also never applies (`volume = 0` never runs), though autoplay policy usually saves it.

**Fix.** Store the acquired MediaStream in a ref/state, and attach it in a `useEffect` that runs when phase becomes 'live': `useEffect(() => { if (phase === 'live' && selfViewRef.current && mediaRef.current) { selfViewRef.current.srcObject = mediaRef.current; selfViewRef.current.volume = 0; } }, [phase])`.

### Practice page copy claims camera/mic/Iris/captions but runner is text-only

`frontend/apps/candidate/app/practice/page.tsx:84` — `copy` · effort `S` · group `assessments-interview`

**Detail.** The 'What practice looks like' panel promises 'Camera and mic on — same proctoring engine, no recording shared', 'Iris asks 3–4 questions in your role's competency frame', and 'Captions on by default'. PracticeRunner (`components/practice-runner.tsx`) is a text `<Textarea>` chat loop with no getUserMedia, no video element, no captions, no proctoring — the file comment even says 'clone of the live text-interview machine with proctoring/consent removed (practice is private — no camera, no fullscreen, no recruiter)'. Candidates who came to rehearse the proctored interview will be confused, click Start, and get a text chat that does not resemble the real experience.

**Fix.** Rewrite the aside bullets to match reality — text-only practice, no proctoring, private growth notes — or wire the runner to use DevicePrecheck + a stubbed self-view so the shape actually matches the real interview.

### Aptitude countdown uses setInterval — drifts on inactive tabs / heavy CPU

`frontend/apps/candidate/lib/use-countdown.ts:26` — `correctness` · effort `S` · group `assessments-interview`

**Detail.** `useCountdown` decrements state by 1 per `setInterval(fn, 1000)` fire and never consults `Date.now()`. Browsers throttle background-tab timers (Chrome to 1s min, Safari further), and any main-thread jank stretches ticks. On a graded timed aptitude assessment the displayed countdown falls behind wall time — a candidate reading a spec in another tab returns to see '3:12 left' when the real deadline has passed. onExpire (which auto-submits) also fires late, so the submit is guaranteed to arrive after the server's own deadline.

**Fix.** Snapshot `const deadline = Date.now() + seconds*1000` on mount, then each tick set `remaining = Math.max(0, Math.round((deadline - Date.now())/1000))`. Fire `onExpire` when the computed remaining hits 0. Same 20-line hook, no new state.

### Aptitude has no beforeunload guard — refresh/back wipes every answer

`frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:108` — `correctness` · effort `S` · group `assessments-interview`

**Detail.** All aptitude state lives in `useState<Record<string, SectionAnswer>>` and `useState<Record<string, RunResult>>` — no persistence to localStorage, no `beforeunload` listener, no in-app nav guard. Cmd-R, backspace outside a text field, closing/reopening the tab, or clicking any link (including the sidebar's own Applications link) silently discards every answer typed and every coding solution written. `components/practice-runner.tsx` already installs a `beforeunload` handler during 'active' — the aptitude page, which is far higher stakes, does not.

**Fix.** Add a `beforeunload` effect gated on `sections.length > 0 && !submit.isSuccess`. For durability, also mirror `answers` to `localStorage` keyed by applicationId and rehydrate on mount — draft persistence at zero backend cost.

### SSO callback 8s timeout guard is dead code - RESOLVE_TIMEOUT_MS can never fire

`frontend/apps/candidate/app/auth/callback/page.tsx:76` — `correctness` · effort `S` · group `auth-flows`

**Detail.** The callback arms window.setTimeout(setError, 8000) then synchronously calls window.clearTimeout(timer) on the very next line (and again in the effect cleanup). router.replace is synchronous (just schedules navigation), so the timer is cancelled well before 8s. The whole RESOLVE_TIMEOUT_MS = 8000 bail-out path - the file's stated purpose for existing - never runs; a user who mid-navigation loses the network or is on a slow router will still see the 'Signing you in...' spinner forever.

**Fix.** Drop the eager clearTimeout right after router.replace. Either (a) rely solely on the effect cleanup to cancel when the component unmounts on successful nav, or (b) also clear inside router.events/on a route-change subscription. The 'stale-toast race' the comment worries about can be handled by checking a mounted ref inside the setTimeout callback.

### SSO callback leaves access_token in URL fragment and browser history

`frontend/apps/candidate/app/auth/callback/page.tsx:80` — `security` · effort `S` · group `auth-flows`

**Detail.** After parsing window.location.hash, the code calls router.replace(roleHome(payload.role)) but never clears the fragment first. The full JWT stays visible in the address bar for the paint before navigation, sits in browser history, and is exposed to any browser extension with URL-read access. Shared devices or screen-sharing during a live SSO flow leaks a bearer token that the resource server still accepts until exp.

**Fix.** Immediately after parsing: history.replaceState(null, '', window.location.pathname) before store.set/router.replace. This wipes the token from both the visible URL and the current history entry without adding a new one.

### SSO callback has no state/nonce validation - Login-CSRF surface

`frontend/apps/candidate/app/auth/callback/page.tsx:56` — `security` · effort `M` · group `auth-flows` **[needs BE]**

**Detail.** The callback accepts whatever #access_token= arrives, structurally validates the JWT, then writes it to the token store and routes. There is no OAuth state parameter compared against a value the browser stashed at authorize-time, and no nonce/aud check on the JWT. A crafted link /auth/callback#access_token=<attacker_token> sent to a victim logs the victim into the attacker's account (classic Login-CSRF); any subsequent inputs - resume, application, messages - are captured under the attacker's session. Login page currently says 'SSO is on the roadmap', so this ships when the roadmap ships.

**Fix.** Before wiring up any SSO button: generate a per-flow state (crypto.randomUUID) at authorize-time, persist it in sessionStorage, and reject the callback unless params.get('state') matches and is consumed exactly once. Additionally verify payload.aud matches the app's expected audience and payload.iss matches the auth service.

### Login/register do not honour a ?redirect / return-to parameter

`frontend/apps/candidate/app/login/page.tsx:73` — `ux` · effort `M` · group `auth-flows`

**Detail.** packages/shared/src/guards.ts bounces unauthed users with a raw router.replace('/login') - no ?redirect=<original path> - and login unconditionally routes to roleHome(role). A candidate who deep-links to /jobs/abc/apply, /applications/xyz, or an email-embedded link gets sent to / after signing in and has to hunt for what they were doing. Same for /register (always -> /verify) and callback (always -> roleHome).

**Fix.** In useRequireAuth append ?redirect=${encodeURIComponent(pathname + search)} when redirecting. In LoginInner.onSubmit and the useEffect that bounces already-authed users, read sp.get('redirect'); if present and it starts with '/' and does not contain '//', route there instead of roleHome(role). Do the same in /auth/callback and after register's auto-login where applicable.

### Sidebar links to /company/messages but the route does not exist

`frontend/apps/candidate/components/company-shell.tsx:51` — `correctness` · effort `M` · group `company-recruiter`

**Detail.** NAV_WORKSPACE includes { href: '/company/messages', label: 'Messages', icon: Mail }. No page exists at frontend/apps/candidate/app/company/messages/. The candidate-side /messages route exists, but the company sidebar link points at the missing company variant and produces a hard 404 on click. The applicant report page compounds this by linking directly to /messages/${appId} (candidate route) from the recruiter surface (line 501).

**Fix.** Either add a /company/messages inbox route (thin wrapper over the existing messages client) or point the nav entry at the shared /messages inbox. Also make the applicant report Messages tab embed the thread instead of linking to /messages/${appId}.

### useRequireRole logs recruiters out when they hit admin-only pages

`frontend/packages/shared/src/guards.ts:27` — `ux` · effort `S` · group `company-recruiter`

**Detail.** useRequireRole fallback defaults to /login. /company/team, /company/billing, /company/audit all call it with ['company_admin']. A signed-in recruiter clicking Team from the sidebar is redirected to /login, which lands on an unauthenticated screen even though their session is valid. The Alert branches at team/page.tsx:72, billing/page.tsx:46, and audit/page.tsx:69 are dead code because the guard fires before they render.

**Fix.** Change these three admin-only pages to pass a fallback of /company (or a dedicated /company/not-authorized view) into useRequireRole, and remove the dead Alert branches. Alternately widen the guard: if the user has a company role but the wrong one, replace to /company; only redirect to /login when no role at all.

### Branding Display name field is discarded on save

`frontend/apps/candidate/app/company/branding/branding-client.ts:107` — `correctness` · effort `S` · group `company-recruiter` **[needs BE]**

**Detail.** makeApiBrandingClient.upsertProfile posts only { about, website, logo, locations }. The form collects displayName (branding/page.tsx line 140) and populates it from p.name on read, but the write path drops it — the proto UpsertCompanyProfileRequest (company_profile_pb.ts line 18-40) has no name/displayName field. Recruiter edits the display name, sees the toast 'Brand saved', refetch returns the old server name — silent data loss. Onboarding page:122 works around this by cramming state.companyName into about, which then collides with a real About body on the branding page.

**Fix.** Either extend the proto to accept display_name (blocked on backend), or hide the Display name input in the editor until the server can persist it. Do not present an input that silently no-ops. Also stop writing companyName into about in onboarding — it corrupts the About copy.

### Onboarding invites always ship with empty tempPassword

`frontend/apps/candidate/app/company/onboarding/page.tsx:171` — `correctness` · effort `M` · group `company-recruiter` **[needs BE]**

**Detail.** api.team.inviteMember({ email, role: 'recruiter', tempPassword: '' }) in the finish() fan-out. The Team page invite dialog (team/page.tsx line 372) enforces password.length < 8 before invoking the same RPC, so the server almost certainly rejects the onboarding path. The Promise.allSettled swallows individual failures into a soft toast, so the recruiter finishes onboarding under the impression the invites landed. Result: no teammates are actually invited, no re-notification anywhere.

**Fix.** Either require the recruiter to enter a temp password per invite (matching the team dialog), or add a server-generated temp password path (RPC change) and route onboarding through it. Never fire inviteMember with '' and pretend it succeeded.

### Integrity flags rendered cap silently drops evidence at three

`frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:669` — `correctness` · effort `S` · group `company-recruiter`

**Detail.** sorted.slice(0, 3).map(...) — a candidate with 4+ integrity flags shows only the first 3 event cards under the timeline. The pips above still render all of them, so the recruiter can see there are 5 dots but can only read 3 event descriptions. There is no show all affordance. Same pattern one function up: CompetencyCard at line 558 uses const ev = c.evidence[0] and renders exactly one transcript quote per competency, silently hiding the rest.

**Fix.** Render all flags (they are already sorted) and, if the count is large, add a Show older toggle. For competencies, map over c.evidence and render each as its own blockquote (or add a collapsible for the 4th+).

### Audit page hard-wired to mock client — real audit log unreachable

`frontend/apps/candidate/app/company/audit/page.tsx:60` — `correctness` · effort `M` · group `company-recruiter` **[needs BE]**

**Detail.** const [client] = useState<AuditClient>(() => makeMockAuditClient()); — no environment gate, no live client seam. Regardless of NEXT_PUBLIC_MOCK, the audit surface only ever renders mock rows. Same shape defect in billing/page.tsx:27 (makeMockBillingClient). The rest of the recruiter surfaces (branding, team, messages) route through a USE_MOCK toggle plus a real client. For an admin-only audit log that the product copy calls the source of hiring truth, the surface being non-functional against real data is a launch blocker.

**Fix.** Add makeApiAuditClient(api) and makeApiBillingClient(api) (even if they are thin passthroughs to future RPCs). Pick between mock and live via NEXT_PUBLIC_MOCK the same way branding-client.ts does. Log a build warning when a live client falls back to mock in production.

### Pipeline Override gate button is nested inside a Link

`frontend/apps/candidate/app/company/jobs/[id]/page.tsx:225` — `correctness` · effort `S` · group `company-recruiter`

**Detail.** The whole kanban card at line 205 is a <Link href='/company/jobs/${id}/applicants/${applicationId}'>. Inside it, ConfirmDialog (which renders a <button> and a Radix dialog trigger) is a descendant of that anchor. Nested interactive elements are invalid HTML and break keyboard/screen-reader focus order. e.stopPropagation() on the button suppresses the click bubble, but Radix Portal + focus trap inside an anchor still confuses assistive tech and can trigger navigation on space/enter.

**Fix.** Restructure so the card is a <div> with an internal <Link> for the title area. Move the Override gate button to a sibling that is not inside the anchor. Keeps the whole card discoverable while allowing the nested action.

### Similar roles fetches 6 global jobs and post-filters, so it usually shows nothing

`frontend/apps/candidate/app/jobs/[id]/similar-roles.tsx:27` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** queryFn calls searchJobs({ pageSize: 6 }) with no company filter, then peers = data.jobs.filter(j.companyId === companyId). In production with jobs spread across many companies, the 6 most recent platform-wide jobs almost never contain 3 same-company entries, so the 'Similar roles' section silently disappears on nearly every JD page. The inline comment even admits 'without a by-company filter on the public search yet'.

**Fix.** Reuse the existing GET /public/companies/{id}/jobs endpoint (companyJobs from companies/[id]/company-client.ts) — it already returns that company's roles — then filter out excludeJobId and slice to 3. Zero new backend surface, and the section becomes actually useful.

### Company 'See all roles' link goes to /jobs?company=… which /jobs silently ignores

`frontend/apps/candidate/app/companies/[id]/page.tsx:144` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** The CTA links to `/jobs?company=${company.id}`, but JobsPage (app/jobs/page.tsx lines 26–34) only destructures q/location/remote/type/level/sort from searchParams, and SearchJobsParams/toQuery have no `company` field. Clicking 'See all roles' lands on the full unfiltered marketplace — the exact opposite of what the copy promises.

**Fix.** Either (a) drop the link and rely on the 'Open roles' section already listed further down the same page (add an in-page anchor and change the label to 'Jump to roles'), or (b) add a `company` param to SearchJobsParams + toQuery + the public search endpoint. (a) is a one-line fix and needs no backend.

### Marketplace filter/sort/pager state never syncs to URL — refresh and share both break

`frontend/apps/candidate/app/jobs/marketplace.tsx:42` — `ux` · effort `S` · group `jobs-discovery`

**Detail.** Params live only in useState; nothing calls router.replace or updates the query string. So (1) refreshing on page 3 with Remote + sort=recent drops to page 1 with initialParams; (2) users can't share/bookmark a filtered result set; (3) browser Back after paginating leaves the route entirely instead of restoring the previous page. The SSR page already accepts these params via searchParams, so the plumbing is half built.

**Fix.** On each setFilters/goToPage call, also run router.replace(`/jobs?${toQuery(next)}`, { scroll: false }). toQuery already exists in search-client.ts. Keep params in useState mirrored to the URL; optionally rehydrate from useSearchParams on client nav.

### JobCard footer 'Apply' pseudo-button just navigates to detail — misleading label

`frontend/apps/candidate/components/job-card.tsx:141` — `ux` · effort `S` · group `jobs-discovery`

**Detail.** Line 141 renders a button-styled <span>Apply</span> (aria-hidden) inside the card-wide <Link href={/jobs/${jobId}}>. Sighted users read it as 'submit application' — but the click just routes to the JD page, where the real Apply modal lives (with a consent step). app/saved/page.tsx line 242 labels the same visual affordance 'View role', showing the intended honest copy already exists in-tree.

**Fix.** Replace the visible text on JobCard.tsx line 145 with 'View role' (or 'View details') to match /saved. Actual application requires consent + auth in ApplyIsland — a label that says 'Apply' from a signed-out marketplace card is a UX lie.

### Schedule slot picker: role='radio' buttons have no arrow-key handling (a11y)

`frontend/apps/candidate/app/schedule/page.tsx:138` — `a11y` · effort `M` · group `jobs-discovery`

**Detail.** The slot grid uses role='radiogroup' (line 138) with children role='radio' <button>s (line 156). WAI-ARIA APG requires composite radio groups to move focus with Arrow keys and expose a single tab stop. There's no onKeyDown, so keyboard users can Tab through every slot (breaking the single-tab-stop contract) but cannot arrow between them, and pressing Space on a focused slot sets picked but doesn't move focus. Screen readers announce 'radio N of M' with no working navigation. Directly hits the audit's 'scheduling picker keyboard access' focus item.

**Fix.** Either (a) render each slot as a real <input type='radio' name='slot'> with a styled <label> — browser handles arrow keys, focus roving, and single tab stop for free; or (b) add an onKeyDown to the grid handling ArrowLeft/Right/Up/Down + Home/End moving focus between slot buttons and setting tabIndex=-1 on the non-active ones.

### Legal TOC collapsed by default: <details> has no `open` on desktop

`frontend/apps/candidate/app/(legal)/legal-shell.tsx:40` — `correctness` · effort `S` · group `marketing-legal-trust`

**Detail.** The sticky on-page navigation for /privacy, /terms and /dpa is wrapped in a bare `<details>` element with no `open` attribute and no CSS rule that opens it on lg. Native `<details>` defaults to closed. Result: on every viewport, first paint of every legal page shows only the text 'On this page' — the numbered section list is hidden until the user notices they can click the summary. On desktop this defeats the whole point of the `lg:sticky lg:top-24` sidebar; on mobile it's fine but there's no visual affordance (list-marker was removed with `list-none`).

**Fix.** Either render `<details open>` unconditionally (drawer collapses on click; still keyboard-accessible) or, better, keep the collapsible pattern only below lg by using a small client wrapper that adds `open` at ≥1024px, or replace with a plain `<nav><ol>` for lg and keep `<details>` for smaller.

### MegaNav "Privacy" link points at /what-we-dont-do, not /privacy

`frontend/packages/ui/src/aperture-chrome.tsx:26` — `correctness` · effort `S` · group `marketing-legal-trust`

**Detail.** APPLICANTS_LINKS declares `{ label: "Privacy", href: "/what-we-dont-do" }`. A candidate clicking the nav item labelled 'Privacy' expects the privacy policy and lands on the 'What Aptura does not do' commitments page instead. The actual `/privacy` route (Privacy Policy) is unreachable from the primary top nav on any applicant surface.

**Fix.** Either point the link at `/privacy` (most likely intent) or rename the label to 'What we don't do' and add a separate 'Privacy' entry that points to `/privacy`. This is inside the shared MarketingShell nav, so the fix propagates to every public applicant page.

### Accessibility page promises a skip-to-content link that MarketingShell doesn't provide

`frontend/packages/ui/src/aperture-chrome.tsx:316` — `a11y` · effort `S` · group `marketing-legal-trust`

**Detail.** accessibility/page.tsx line 45 explicitly commits: 'Skip-to-content link on every page.' MarketingShell renders `<MegaNav /><main>{children}</main><MegaFooter />` with no skip link, and the `<main>` element has no id anchor. Every marketing/legal/trust surface therefore forces keyboard/AT users to tab through the entire nav (brand + up to 4 links + audience-switcher + burger) to reach content. The equivalent AppShell for authenticated views does provide a skip link (`app-shell.tsx` line 98) — the promise is real, just not implemented on the public surface.

**Fix.** In MarketingShell, prepend the same sr-only-until-focus link used in AppShell (`<a href="#main" className="sr-only ... focus:not-sr-only">Skip to content</a>`) and add `id="main"` to `<main>`. Server component-safe.

### Pilot form always shows success 600 ms after mailto: regardless of outcome

`frontend/apps/candidate/app/pilot/page-client.tsx:33` — `error-handling` · effort `S` · group `marketing-legal-trust`

**Detail.** handleSubmit sets `window.location.href = mailto:...` then `setTimeout(() => setStatus("done"), 600)`. There is no branch for (a) no default mail handler configured (the navigation is a no-op), (b) the user cancelling the mail composition, or (c) the user changing their mind and wanting to submit again. In all three cases the form silently hides the fields and displays 'Mail composed in your client.' with only a fallback address — the request never went anywhere and the user has no way to re-submit without a full page reload. Contact-your-vendor CTA on the primary hiring-team acquisition surface.

**Fix.** Two small changes: (1) after showing 'done', include a visible 'Send another' button that resets state to 'idle' and re-renders the form (preserve FormData if desired); (2) reword the done state to 'Your mail client should open with your request. If it didn't, copy this email and message: hello@aptura.app' and show the composed body so the user can paste. Longer-term: wire the backend `forms.submitPilot` seam the comment already flags as TBD.

### Status page falsely reports Operational statically with no timestamp

`frontend/apps/candidate/app/status/page.tsx:27` — `correctness` · effort `M` · group `marketing-legal-trust` **[needs BE]**

**Detail.** The h1 declares 'All systems normal.', a green banner declares 'All systems operational', and every one of the six services renders `ap-pill--good` 'Operational'. The only disclaimer is a small paragraph. There is no last-updated / last-checked timestamp anywhere. If an outage happens (or the marketplace goes down at launch) this page will actively contradict reality until a human ships a code change. The banner subtitle 'Last build: deploy time (not a live healthcheck)' acknowledges the problem but doesn't remove the misleading green signals above it.

**Fix.** See detail — combined status + fix.

### Security tab shows 'Not enabled' for users who already have 2FA on

`frontend/apps/candidate/components/settings/security-tab.tsx:118` — `correctness` · effort `M` · group `onboarding-profile-account` **[needs BE]**

**Detail.** `SecurityTab` seeds `const [enabled, setEnabled] = useState(false)` and only flips it via the local dialog callbacks. Any page refresh, tab switch, or first visit shows 2FA as 'Not enabled' regardless of the real server state — even though `settings_pb.ts` is now generated and the SettingsService is live. The user is offered the 'Set up 2FA' button, which then fails on `setupTotp` (server-side already-enrolled error) with only a toast — leaving the UI in a permanently wrong state. The comment on line 116 acknowledges this was a pre-gen shortcut.

**Fix.** Add a `totpEnabled` field to the me/session read (auth `whoami` or profile) and drive `enabled` from that query; remove local `useState(false)` seed. Meanwhile, at minimum, catch the 'already enrolled' error from setupTotp and set enabled=true.

### Unsaved profile edits silently lost on any in-app navigation

`frontend/apps/candidate/app/profile/page.tsx:169` — `ux` · effort `M` · group `onboarding-profile-account`

**Detail.** The beforeunload listener only fires for hard refresh / tab close. Clicking the sidebar, the top-nav, or any `<Link>` in `CandidateShell` triggers a Next.js App Router client navigation which does NOT emit beforeunload, so `touched.current` is never checked and every edit made since the last save is gone with zero prompt. This is the primary loss path — most users navigate via the shell, not by closing the tab.

**Fix.** Wrap the navigation guard with the Next.js 15 `useRouter().push` intercept pattern (patch router methods behind an `useOnBeforeNavigate` hook) or use `next/link`'s `onNavigate` to show a ConfirmDialog when `touched.current`. Move this into `@ip/shared` since /profile isn't the only long form.

### Privacy tab has no way to withdraw a consent once granted

`frontend/apps/candidate/components/settings/privacy-tab.tsx:79` — `correctness` · effort `S` · group `onboarding-profile-account` **[needs BE]**

**Detail.** The SCOPES list renders a 'Grant' Button for un-granted scopes and a 'Granted' Badge for granted ones — there is no revoke action anywhere. Once a candidate grants `automated_evaluation`, the only way to withdraw is to click 'Erase my account'. GDPR requires withdrawal to be as easy as consent; shipping a consent screen without a revoke path is a legal-review finding, not a polish item.

**Fix.** Wire a `revokeConsent(scope)` mutation to a small 'Revoke' outline button next to the Granted badge. If the backend RPC doesn't exist yet, block-scope the button and flag the missing endpoint.

### Onboarding sends age: 0 to updateProfile on every step save

`frontend/apps/candidate/app/onboarding/page.tsx:183` — `correctness` · effort `S` · group `onboarding-profile-account` **[needs BE]**

**Detail.** The save mutation always passes `age: p?.age ?? 0` (line 183). New candidates who haven't opened /profile have no age set; the RPC receives 0. /profile's UI enforces `min={16} max={100}` so the backend rule is presumably the same — advancing step 1 will fail with a validation error on every fresh onboarding, and the wizard just shows a toast (`onError`) with the user stuck. Even if the server currently accepts 0, a later add of the range check silently breaks first-run.

**Fix.** Make `age` optional in the DTO or omit the field entirely when it's 0/unset. Same fix on /profile: send `age: form.age || undefined` and change the DTO to `age?: number`.

### error.tsx renders two identical 'Try again' buttons for the same reset action

`frontend/apps/candidate/app/error.tsx:27` — `ux` · effort `S` · group `root-home-shell`

**Detail.** The `ErrorState` from @ip/ui (packages/ui/src/layout.tsx line 160-169) already renders a 'Try again' button when a `retry` prop is passed. This file passes `retry={reset}` on line 28 AND then adds a separate `<Button onClick={reset}>Try again</Button>` on line 32 — the recovery screen shows two buttons stacked, both firing `reset()`. Duplication verified in ErrorState source: `<RefreshCwIcon /> Try again`.

**Fix.** Drop either the standalone `<Button>` or the `retry` prop on `ErrorState`. Simplest: delete line 32 and its wrapping div, keep only the ErrorState. Or drop the `retry` on ErrorState and keep the standalone Button below.

### global-error.tsx uses dark background/text on an app documented as light-only

`frontend/apps/candidate/app/global-error.tsx:35` — `design` · effort `S` · group `root-home-shell`

**Detail.** layout.tsx (lines 10-11, 28-32) and globals.css (line 14-16) explicitly state the app is 'Light mode only — no dark class, no appearance toggle (decided 2026-07-10)'. The viewport.themeColor is `#f7f8fb`. But global-error.tsx hardcodes `background: '#15161e'` and `color: '#f7f7f9'` — the only screen a user sees when the root layout itself fails will suddenly be a dark chrome that doesn't exist anywhere else in the product. Looks copy-pasted from a dark-mode template.

**Fix.** Swap the inline colors to the light palette used elsewhere: `background: '#f7f8fb'`, `color: '#15161e'` (or a mid-ink like `#3a3d4a`), keep the brand teal button. Keep it dependency-free — no need to import tokens (global-error must render even if globals.css failed).

## P2-moderate

### Application detail reimplements status-pill tone mapping instead of using @ip/ui

`frontend/apps/candidate/app/applications/[id]/page.tsx:430` — `refactor` · effort `S` · group `applications-messaging`

**Detail.** Local `pillVariant(state)` returns bespoke `ap-pill--good | ap-pill--danger | ap-pill--teal | ''` classes and the page calls it right next to `applicationStatus(app.state)` (which already carries a `tone: BadgeTone` field from `@ip/ui`'s single source). The company-side surfaces use `statusToneClasses(tone)` on the same states, so the dashboard/company/candidate pills can drift (e.g., `withdrawn/expired/abandoned` here return `''` — no color, no background, just a floating dot). The tone map already exists.

**Fix.** Delete `pillVariant`. Compose `applicationPillStatus(app.state)` + `statusToneClasses(tone)` from `@ip/ui` and reuse the shared `.ap-pill` shell. One less local mapping to keep in sync.

### Desktop messages inbox double-fires markRead per thread open

`frontend/apps/candidate/app/messages/page.tsx:85` — `performance` · effort `S` · group `applications-messaging`

**Detail.** The inbox `useEffect` on line 85 calls `client.markRead(openId)` whenever `openId` changes. The `MessageThreadView` mounted in the right pane also runs `useThreadMessages`, whose own effect (packages/shared/src/use-thread-messages.ts:118) calls `client.markRead(applicationId)` the moment it sees unread inbound. On desktop every thread open therefore fires two markRead RPCs and two `invalidateQueries({ queryKey: listQueryKey })` cycles back-to-back. The mobile /messages/[applicationId] page correctly leaves it to the hook.

**Fix.** Delete the inbox-level markRead effect and rely on `useThreadMessages` alone (it already fires on both initial mount with inbound and on new inbound). Or, if the intent is to clear the badge even for already-read threads, keep it and remove the one inside the hook — but not both.

### Inbox filter matches jobTitle/companyName but ignores the snippet the row shows

`frontend/apps/candidate/app/messages/page.tsx:107` — `ux` · effort `S` · group `applications-messaging`

**Detail.** The filter (line 106-112) only lowercases-substring-matches `t.jobTitle` and `t.companyName`. The row prominently renders `t.lastSnippet` two lines below, so a candidate typing a memorable phrase from a recruiter message ('rescheduling', 'take-home', a person's name) will find nothing. Placeholder text 'Filter by role or company' partially explains the miss, but the natural expectation on a search input that sits above snippets is to search snippets.

**Fix.** Include `t.lastSnippet.toLowerCase().includes(q)` in the OR chain. One line.

### Notifications feed has no grouping and no unread-only filter

`frontend/apps/candidate/app/notifications/page.tsx:122` — `ux` · effort `M` · group `applications-messaging`

**Detail.** The feed renders a flat `<ul>` of `NotificationItem` rows (line 122-142). There is no Today / Yesterday / Older grouping, no 'unread only' toggle, and no filter by kind — even though the client's `list()` already accepts `unreadOnly` (notifications-client.ts:79). A candidate with 50 total / 3 unread has to eyeball the small primary dot on each row to find them. Ordering is server-desc-by-createdAt but not visually chunked.

**Fix.** Add a two-tab strip (All / Unread) that flips the `unreadOnly` param on the query key, and section rows by relative-day header (`Today`, `Yesterday`, `This week`, `Earlier`). The `RelativeTime` timestamp is already computed per-row so grouping is a client-side bucket-by-day pass.

### Done page misclassifies FailedPrecondition as integrity termination

`frontend/apps/candidate/app/interview/[applicationId]/page.tsx:119` — `copy` · effort `S` · group `assessments-interview`

**Detail.** `endSession` pushes to done with `?reason=auto_terminated` for any reason that is not 'ended_by_candidate' — including `endSession('session_ended')` triggered from the FailedPrecondition catch (line 215-217), which means 'this room is not startable right now' (already-completed / not yet reachable funnel state). The done page's AutoTerminatedState then tells the candidate 'A high-severity integrity signal was detected and the session was ended automatically… The recruiter has been notified.' — a false and reputationally damaging message for a candidate whose room simply was not open.

**Fix.** Propagate a specific reason: push `?reason=session_ended` for the FailedPrecondition path and render a third, neutral state on the done page ('This interview isn't currently open — check your tracker'). Only the true integrity-terminated ack should render AutoTerminatedState.

### Lobby environment scan + ID check are silent stubs that pass on click

`frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:113` — `ux` · effort `M` · group `assessments-interview`

**Detail.** `runEnvironmentScan` (line 113-115) sets `environment: 'pass'` with zero probing — no display count check, no bandwidth/latency probe, no permissions review. `runIdCheck` (line 119-121) does the same. The ID check at least carries an inline 'Placeholder · selfie capture wires up in v3.2' disclaimer; the environment scan does not, so the candidate genuinely believes a real scan just verified their room. On a proctored-interview flow this manufactures confidence in checks that never happened.

**Fix.** Either label the env-scan tile 'Placeholder' the same way ID does, or wire a real probe now: multi-monitor via `window.getScreenDetails()` (Screen Details API, no lockfile change) + display count / secondary monitor, and hide the button until it is real.

### No VU / audio-level meter in lobby or room — candidate can't confirm mic is capturing

`frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:246` — `ux` · effort `S` · group `assessments-interview`

**Detail.** Lobby shows a camera preview only — the mic gate flips to 'pass' the instant `getAudioTracks().length > 0`, which is true even for a hardware-muted, wrong-input, or 0-gain microphone. There is no waveform, level bar, or 'say something to test' feedback. Room HUD's Chip 'Mic' switches to 'Check' only when a second_voice/synthetic detector fires — never based on the candidate's own level. A candidate whose OS mic is muted enters the interview, gets no audio in for the entire session, and loses the interview.

**Fix.** Add a Web Audio AnalyserNode on the acquired audio track in the lobby (already granted), animate a 5-bar meter from the RMS. ~30 lines, no new deps. Bonus: mark mic gate as 'warn' if no level detected within 5s of preview.

### 'Iris · speaking' indicator hardcoded — `onRemoteSpeaking` never subscribed

`frontend/apps/candidate/app/interview/[applicationId]/page.tsx:326` — `correctness` · effort `S` · group `assessments-interview`

**Detail.** The HUD renders `<span className='ap-hud-interviewer'><span className='ap-dot' /> Iris · speaking</span>` as static text. The `InterviewRoom` seam exposes `onRemoteSpeaking(cb)` and the fake room even drives it, but the page never calls `r.onRemoteSpeaking(...)` after `r.onCaption(...)` at line 176. Result: the indicator lies during any silent pause and, worse, keeps saying 'speaking' after Iris is done — the candidate has no reliable cue for when to start their answer.

**Fix.** Add `const [speaking, setSpeaking] = useState(false)` and `r.onRemoteSpeaking(setSpeaking)` next to `onCaption`. Render '· speaking' when true, '· listening' otherwise.

### No room disconnect / reconnect handling — LiveKit drop is invisible

`frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts:7` — `error-handling` · effort `M` · group `assessments-interview`

**Detail.** `InterviewRoom` interface has `onCaption`, `onRemoteSpeaking`, `disconnect` — no `onDisconnected` / `onReconnecting` / `onReconnected`. The page has no listener for connection state. When the real LiveKit swap happens (deferred, per the comment) or even today's fake room's `disconnect()` is called externally, the candidate keeps seeing 'Live', keeps talking, and captions/audio just stop. Task explicitly calls out 'LiveKit reconnect handling' as a focus for this group.

**Fix.** Extend the interface with `onConnectionState(cb: (state: 'connected'|'reconnecting'|'disconnected') => void)` and render a non-blocking banner ('Reconnecting to Iris…') in the room while state is 'reconnecting'. LiveKit's `Room` fires `RoomEvent.Reconnecting` / `Reconnected` / `Disconnected` — one wire-up.

### Aptitude Submit stays disabled if candidate never edits starter code

`frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:57` — `correctness` · effort `S` · group `assessments-interview`

**Detail.** `isAnswered` treats a coding section as answered only when `answers[s.id]` exists AND `a.source.trim().length > 0`. The initial render passes `source = a?.kind === 'coding' ? a.source : s.starterCode ?? ''` to the editor but never writes that starter into `answers`. A candidate who reads the starter, clicks Run, sees all visible cases pass, and hits Submit will find Submit disabled — because they never actually typed and `answers[s.id]` is still undefined. Cognitive-load booby-trap on a timed test.

**Fix.** Seed `answers[s.id]` with the starter on mount for each coding section (single effect keyed on `sections`), or change `isAnswered` for coding to `(a?.source ?? section.starterCode ?? '').trim().length > 0` so the starter counts as 'answered' but the candidate can still overwrite it.

### Waitlist always shows 'Mail composed' - even if user has no mail client

`frontend/apps/candidate/app/waitlist/page-client.tsx:25` — `correctness` · effort `S` · group `auth-flows` **[needs BE]**

**Detail.** handleSubmit sets window.location.href = 'mailto:...' then unconditionally setTimeout(() => setStatus('done'), 600). On mobile browsers without a configured mail app (e.g. iOS Chrome with no Mail account, most Android Chrome installs, corporate desktops with no default handler), the mailto silently fails but the UI still flips to a green check with 'Mail composed in your client.' The user believes they've joined a waitlist that never received their email. This is a real signup leak, not a polish nit - the whole waitlist has no server persistence, so a false success is 100% data loss for that lead.

**Fix.** Two options, cheapest first: (a) do not auto-flip to success; keep the button and show a persistent hint 'If your mail client didn't open, write to hello@aptura.app' with a copy-to-clipboard button - never claim success. (b) Wire the promised forms.submitWaitlist endpoint; mailto is a placeholder that has outlived its usefulness.

### Auth Field never sets aria-invalid or aria-describedby on error

`frontend/apps/candidate/components/auth/auth-card.tsx:131` — `a11y` · effort `M` · group `auth-flows`

**Detail.** The shared Field renders <input> with no aria-invalid, aria-describedby, or aria-errormessage. Errors surface via a sibling <Notice role='alert'> at the top of the form (login, register, reset), so screen readers hear the message but the offending input is never marked invalid and focus is never returned to it. Keyboard-only users landing on 'The two passwords don't match' on /reset have no way to jump back to the wrong field - they must tab through everything again.

**Fix.** Extend Field with an error?: string prop. When set: add aria-invalid='true', aria-describedby={errId}, render the message under the input with id={errId} and role='alert', and apply an error-tone border. Rework the four pages so error state maps to the offending field (e.g. reset password mismatch -> set on confirm) and focus that input on submit failure.

### Password fields have no show/hide toggle across login, register, reset

`frontend/apps/candidate/components/auth/auth-card.tsx:131` — `ux` · effort `S` · group `auth-flows`

**Detail.** Every password input on /login, /register, /reset is a raw <input type='password'> with no reveal control. On mobile the typo rate on obscured 12+ character passwords is high; the current UI's only feedback for a wrong password is a server round-trip. /reset compounds this: user types the same wrong password twice into two masked fields and only learns 'passwords don't match' after submit.

**Fix.** Add a type='password' branch inside Field that renders a right-aligned eye/eye-off <button type='button' aria-pressed> toggling the input type. Wire the existing trailing slot in login (already used for 'Forgot?') to a stack that includes both. Keep autocomplete attributes intact.

### Register password-strength meter is decorative - weak passwords still submit

`frontend/apps/candidate/app/register/page.tsx:88` — `ux` · effort `S` · group `auth-flows`

**Detail.** scorePassword labels 'abcdefgh' as 'Too short or simple' but the submit button's disabled only checks !email.trim() || !password || busy, so the account is created (or the server rejects) with a weak password anyway. Users are told 'weak' visually then successfully proceed - the meter's implicit promise (weak passwords are blocked) is broken. Either it should block, or it should not lie by showing red bars for values the UI in fact accepts.

**Fix.** Cheapest lazy fix: gate submit on strength.score >= 2 and add a hint under the field: 'Include a number or symbol.' If backend rules differ, mirror them exactly. Keeping the meter but always allowing submit is worse than deleting the meter.

### Audit filter queries refire on every keystroke — no debouncing

`frontend/apps/candidate/app/company/audit/page.tsx:66` — `performance` · effort `S` · group `company-recruiter`

**Detail.** queryKey: ['audit', 'list', params] and the reviewer/job/applicant filters set params synchronously on every onChange (lines 130, 145, 156). Typing u_abc123 fires 8 audit list RPCs. TanStack dedups identical fetches, not sequential ones, so every character produces a new request. The from/to date inputs are also stored raw as YYYY-MM-DD strings via e.target.value || undefined and passed to the API without any ISO conversion.

**Fix.** Split the input state from the applied filter state: keep a draft local to the input and only push into params on blur or a small debounce (250ms). Normalize date inputs to full ISO before sending.

### LogoPicker leaks object URLs and desyncs from parent preview on refetch

`frontend/apps/candidate/app/company/branding/page.tsx:261` — `correctness` · effort `S` · group `company-recruiter`

**Detail.** URL.createObjectURL(file) is called on every pick but never revoked — the old blob stays alive until the tab closes. Second issue: LogoPicker initializes preview from initialUrl in useState only once, so after the parent save mutation invalidates and refetches, the picker keeps the old preview even though profile.data.logoUrl (and the sibling BrandPreview) updates. The recruiter sees stale logo in the editor and fresh logo in the preview column.

**Fix.** Wrap the preview URL in useEffect cleanup that calls URL.revokeObjectURL on unmount and before replacing. Sync preview with initialUrl via a useEffect (or drop LogoPicker local state and lift it to the parent since logoPreview already exists there).

### Schedule download revokes blob URL before browser can start download

`frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:141` — `correctness` · effort `S` · group `company-recruiter`

**Detail.** addToCalendar runs URL.revokeObjectURL(a.href) synchronously after a.click(). Chrome usually tolerates this; Safari and some mobile browsers race and cancel the download or hand back an empty .ics. There is also no document.body.appendChild(a) — Safari requires the anchor to be in the DOM for .click() to fire a download in some versions.

**Fix.** Append a to document.body, click, remove, then defer revoke with setTimeout(() => URL.revokeObjectURL(url), 1000) or use URL.revokeObjectURL inside a requestAnimationFrame after a.remove().

### Schedule form accepts past times and duplicate slots

`frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:155` — `error-handling` · effort `S` · group `company-recruiter`

**Detail.** The hasSlot check only asserts at least one slot has a value. There is no validation that localInputToUtcIso(r.local) produces a future time or that any two slots do not collide. A recruiter can propose yesterday 10am or three identical slots and see Times proposed. The candidate-facing surface then has to reject or hide them.

**Fix.** In the mutation prep block (lines 104-109), filter out slots whose parsed UTC time is <= Date.now(), dedupe by ISO string, and surface a per-row inline error when the input is invalid. Disable Propose when no valid future slots remain.

### Job edit save silently no-ops under NEXT_PUBLIC_MOCK but toasts success

`frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:91` — `correctness` · effort `S` · group `company-recruiter` **[needs BE]**

**Detail.** if (MOCK) return; — the mutation resolves without touching anything, then onSuccess runs toast.success('Job updated') and invalidates the job query. The subsequent refetch returns the untouched server (or the mock) record, and the form re-hydrates to the pre-edit values. In mock dev this looks broken; worse, updateJob is currently the cast through unknown stub, so in a non-mock env with a server that has not shipped updateJob yet, this throws with an unfriendly protobuf error but recruiter sees no context.

**Fix.** In MOCK mode, run the mutation against an in-memory mock client (mirror branding-client.ts), so the UI reflects the edit. In live mode, wrap the updateJob call in a try/catch that surfaces 'Editing is not wired yet' until the RPC ships, and remove the unknown-cast seam entirely once the proto lands.

### Dashboard 'Applicants this week' is actually all-time and double-counts scored

`frontend/apps/candidate/app/company/page.tsx:76` — `correctness` · effort `S` · group `company-recruiter` **[needs BE]**

**Detail.** applicantsTotal = sumStages(stages, () => true) — sums every stage from getFunnelAnalytics({}). That RPC has no range argument (per analytics/page.tsx:19-20 the window is last-30-days, not last-week), so the KPI labeled 'Applicants this week' over-reports by roughly 4x. Separately, interviewsScheduled and decisionsPending both include the scored state (lines 78 and 81), so any candidate whose interview is scored counts once as scheduled and once as pending — the sum of the four stat tiles double-counts them.

**Fix.** Rename the tile to 'Applicants (last 30 days)' to match the funnel window, and separate the two derived metrics: interviewsScheduled = sum(['interview_pending']), decisionsPending = sum(['scored','assessment_review']). If 'this week' is required as a distinct metric, add a range param to getFunnelAnalytics.

### Rubric editor drops descriptors and unsaved changes when switching rubrics

`frontend/apps/candidate/app/company/rubrics/page.tsx:75` — `ux` · effort `S` · group `company-recruiter`

**Detail.** loadForEdit overwrites rows/name state without checking save.isPending, unsaved diffs, or the descriptor text (which itself is dropped on save per the docstring at line 42). A recruiter mid-edit can single-click a rubric in the left rail and lose everything with no confirmation. The descriptor caveat is only a one-line hint at line 340; a naive user will type long descriptors that vanish on both save and rubric switch.

**Fix.** Track a dirty flag (compare current form vs last-loaded snapshot). When loadForEdit is called with dirty=true, show a ConfirmDialog ('Discard your unsaved edits?') — reuse the existing ConfirmDialog primitive. Optionally persist descriptors to localStorage per rubric id so the recruiter recovers them across sessions.

### SaveJobButton (real <button>) nested inside <Link>/<a> — invalid HTML

`frontend/apps/candidate/components/job-card.tsx:140` — `a11y` · effort `M` · group `jobs-discovery`

**Detail.** JobCard wraps the whole card in <Link href={/jobs/${jobId}}> (line 80) and drops the SaveJobButton (which renders a <button>) into the footer at line 140. HTML disallows interactive descendants inside <a>. Same anti-pattern in app/saved/page.tsx line 236, where the button is wrapped in <span onClick={stopPropagation}> — the span isn't focusable, so keyboard users tabbing to the save button still activate the anchor on Enter. Produces React hydration warnings and unpredictable assistive-tech behavior.

**Fix.** Don't wrap the entire card in <Link>. Make the title/company block the anchor (with a stretched-link pseudo-element to keep the whole card clickable for mouse users), and place SaveJobButton + the visual 'View role' pill as siblings in the card footer, outside the anchor.

### Alerts form: keyword accepts empty submits and lacks location/skills inputs

`frontend/apps/candidate/app/alerts/page.tsx:167` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** submit() calls onCreate({ keyword: keyword.trim(), … }) with no required/minLength attribute on the <input>. An empty submit sends '' to api.jobAlerts.create; the backend then errors and toast.error surfaces the raw message. Also the form only collects keyword + remote + frequency, but AlertFilters supports location/employmentType/experienceLevel/skills and summarizeAlert renders them — so alerts are strictly less expressive than the marketplace search they mimic.

**Fix.** Add required + minLength=2 to the keyword input (and disable the submit button while keyword.trim().length < 2) so the client blocks empty submits before the network call. Optionally add a Location text field mirroring JobSearchBar for parity with the marketplace.

### Sort control uses role='tab' with no tabpanel — wrong ARIA role

`frontend/apps/candidate/app/jobs/marketplace.tsx:100` — `a11y` · effort `S` · group `jobs-discovery`

**Detail.** Lines 100–128 wrap the Best-match / Newest toggles in role='tablist' + role='tab' + aria-selected. There's no corresponding role='tabpanel', so screen readers announce 'tab 1 of 2' but nothing is revealed — the toggles just re-sort the same list below. Semantically these are toggle buttons, not tabs.

**Fix.** Drop role='tablist' / role='tab' / aria-selected. Keep them as <button aria-pressed={active}> inside a plain <div role='group' aria-label='Sort'>. Same visual, correct semantics.

### JobSearchBar local input state never re-syncs when parent value changes

`frontend/apps/candidate/components/job-search-bar.tsx:19` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** useState is seeded from value.q / value.location once (lines 19–20) and never re-syncs. If Marketplace ever wires URL sync (see the URL-sync finding), or you add a 'Clear all' that resets q/location, or the user hits browser Back/Forward, the input fields keep their old typed values while params reflect the new state — confusing and easy to miss because the current app doesn't yet exercise the path.

**Fix.** Either drop local state entirely (fully controlled by parent — no debounce needed since submission is form-based) or add a useEffect to sync q/location from value when the prop changes.

### ApplyIsland fires job.viewed for signed-out visitors and crawlers too

`frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:46` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** The effect at lines 46–48 tracks 'job.viewed' unconditionally on mount, before the ready/token check at line 82. The inline comment claims this is 'the reliable signal that a real user viewed the job detail' — but crawlers, bots, and unauth'd browsers all fire it too, inflating view counts and defeating the stated purpose.

**Fix.** Guard the track call: useEffect(() => { if (ready && token) track('job.viewed', { job_id: jobId }); }, [ready, token, jobId]). If anonymous views are actually wanted, at minimum wait for ready to be true so the SSR-hydration double-fire is avoided.

### Trust page audience flips nav+footer to hiring-teams for candidate visitors

`frontend/apps/candidate/app/trust/page.tsx:12` — `ux` · effort `S` · group `marketing-legal-trust`

**Detail.** trust/page.tsx passes `audience="hiring-teams"` to MarketingShell, so its top nav shows HIRING_TEAMS_LINKS (Compare, Trust, hiring 'How it works' → /hiring-teams#how) and its brand link is /hiring-teams. But three applicant-facing pages link the exact 'Trust Architecture' CTA to /trust: ai-explainability/page.tsx line 145, what-we-dont-do/page.tsx line 87, and accessibility/page.tsx line 112. A candidate following the CTA arrives with the entire chrome switched to hiring-team world (coral → teal, different links, different footer) with no warning and no easy return path. It also breaks the sample-report/pilot CTAs at the bottom of the trust page for that reader (the CTA copy is company-facing).

**Fix.** Simplest: change `audience` to `"applicants"` — trust is a candidate-and-hiring-team resource and the applicant nav still surfaces Trust via a rename per finding #2. If the trust page really needs the hiring chrome, at minimum add a small audience-aware header inside the page ('Reading as a candidate? See /what-we-dont-do') and stop cross-linking to it from applicant pages.

### /hiring-teams uses temporary redirect (307) instead of permanent (308)

`frontend/apps/candidate/app/hiring-teams/page.tsx:8` — `correctness` · effort `S` · group `marketing-legal-trust`

**Detail.** The comment states this route exists solely so old inbound links don't 404 and that there is one single landing. That is a permanent consolidation. `redirect("/")` from `next/navigation` returns 307 — Google keeps both URLs indexed and may split PageRank. Bookmarks and inbound backlinks (Google-cached PR articles, LinkedIn) won't consolidate.

**Fix.** Swap for `permanentRedirect("/")` (`import { permanentRedirect } from "next/navigation"`). Everything else stays. If any nav links intentionally rely on preserving `#anchor` fragments (HIRING_TEAMS_LINKS uses `/hiring-teams#how`), verify browsers still forward the fragment across 308 (they do per RFC 7231, but confirm on the target — CandidateBody has `#how` while CompanyBody does too; the audience mismatch of the fragment is a separate issue).

### No per-page openGraph or canonical on any marketing/legal/trust page

`frontend/apps/candidate/app/trust/page.tsx:4` — `correctness` · effort `S` · group `marketing-legal-trust`

**Detail.** Every page in this group sets `metadata = { title, description }` and nothing else — no `openGraph`, no `twitter`, no `alternates.canonical`. As a result, every share card for /privacy, /terms, /dpa, /trust, /pilot, /status, /accessibility, /ai-explainability, /what-we-dont-do renders with the root OG image and the site tagline 'Get seen. Get interviewed. Get hired.' regardless of the page. jobs/[id]/page.tsx is the only page setting `alternates.canonical`, proving the pattern is intentional elsewhere but missing here. Bad for social shares of legal / trust pages that get sent around during vendor procurement.

**Fix.** Add `openGraph: { title, description, url: <path>, type: "article" }` and `alternates: { canonical: <path> }` to each page metadata. Cheap to factor into a `metaFor({ title, description, path })` helper in `frontend/apps/candidate/app/_lib/` or similar. Optional: per-page opengraph-image.tsx for /trust and /ai-explainability where the share matters most.

### Pilot form has no reset — 'done' state is a dead end without page reload

`frontend/apps/candidate/app/pilot/page-client.tsx:77` — `ux` · effort `S` · group `marketing-legal-trust`

**Detail.** Once `status === "done"` the form JSX is replaced by a success card with a bare fallback mailto: link. No 'Submit another request' button, no way to edit the composed body, and if the user came back to send a colleague's info they must hard-refresh. Combined with finding #4 (false-success), a user who cancels their mail client is stuck.

**Fix.** Below the fallback text, add `<button type="button" onClick={() => setStatus("idle")} className="ap-btn ap-btn-ghost">Send another</button>`. Since the form fields are uncontrolled, they'll re-render empty — desired behaviour.

### SkillChips drops in-progress skill when user clicks Save with input focused

`frontend/apps/candidate/components/profile/skill-chips.tsx:70` — `correctness` · effort `S` · group `onboarding-profile-account`

**Detail.** SkillChips commits the draft on `onBlur` via `onChange(next)` (line 70). When the user types 'kubernetes' and clicks the Save button in the profile header, blur fires first and schedules a `setForm` update, but the button's onClick reads `form.skills` synchronously via the mutation and misses the not-yet-committed skill. The user sees the chip appear right as the save fires with the old array — the skill isn't saved.

**Fix.** Move commit onto the parent's submit path: either lift the draft state (return `{ chips, draft }` and merge on submit), or use `onMouseDown` on the Save button to preempt blur, or dispatch the state update synchronously via `flushSync` in the blur handler.

### Settings tab clicks don't update ?tab= — back button and shareable links broken

`frontend/apps/candidate/app/settings/page.tsx:33` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** `<Tabs defaultValue={initial}>` reads the URL once, but the Radix Tabs primitive has no controlled value/router sync — clicking 'Security' does not change the URL, so hitting back after opening /settings?tab=privacy → clicking Security returns you to whatever the previous route was, not privacy. Deep-links from support macros or notification emails ('open your Security tab') can't be produced.

**Fix.** Make Tabs controlled: `<Tabs value={active} onValueChange={(v) => router.replace(`/settings?tab=${v}`, { scroll: false })}>` with `active` derived from `useSearchParams`.

### Notifications tab fires a full setPrefs POST on every single checkbox toggle

`frontend/apps/candidate/components/settings/notifications-tab.tsx:77` — `performance` · effort `S` · group `onboarding-profile-account`

**Detail.** `patch()` calls `save.mutate({ ...p, ...d })` synchronously on every `onCheckedChange`. A user unchecking four email categories issues four sequential full-body writes. Because there's no serialization guard, on a slow uplink these can complete out of order and the last write to arrive at the server may be missing changes the user made after it, leaving the persisted prefs out of sync with the UI (which was reconciled optimistically from the earlier `setQueryData`).

**Fix.** Debounce `patch` (300ms) and coalesce pending edits into a single call, or serialize via a mutation queue (`mutationKey: prefsKey` in TanStack Query). Also invalidate ONLY on the last-in-flight settle.

### Erase-my-account has no typed-confirmation gate for an irreversible action

`frontend/apps/candidate/components/settings/privacy-tab.tsx:115` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** A single `ConfirmDialog` with a red 'Erase everything' button is the only barrier between one misclick and permanent loss of resume, interview recordings, and application history. Standard practice for destructive-and-irreversible flows is a typed-confirmation (type your email or 'DELETE'). This surface is even the target of the /account → ?tab=privacy redirect, so users may land here without expecting the button.

**Fix.** Replace ConfirmDialog with a bespoke Dialog containing an `<Input>` that must match the user's email (from the JWT) before the destructive button enables. Reuse the DisableTotpDialog structure.

### TOTP setup: no QR code rendered even though provisioning URI is returned

`frontend/apps/candidate/components/settings/totp-setup-dialog.tsx:100` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** The server returns `provisioning_uri` (otpauth://) explicitly for QR generation (see settings_pb.ts SetupTotpResponse.provisioning_uri), but the dialog only shows the manual base32 secret — forcing every user to type/paste it into their authenticator. This is the primary happy path for 2FA enrollment; a QR is expected UX.

**Fix.** Add a tiny QR renderer — a stdlib-only approach is `qrcode` (already in most React stacks) or a wasm-free `qr-code-styling` — and render `setup.provisioningUri` as an SVG above the manual key, with the key kept as a copy-fallback.

### TOTP recovery-codes screen lets user Done-out without acknowledging save

`frontend/apps/candidate/components/settings/totp-setup-dialog.tsx:95` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** The recovery-codes state (line 80-98) shows the codes once and then a plain 'Done' button. If the user closes without copying, the codes are unrecoverable (comment on line 30 confirms 'recovery codes are not re-fetchable'). No 'I've saved these somewhere safe' checkbox gates 'Done'.

**Fix.** Add a required checkbox 'I've saved these codes' below the code grid; `Done` stays disabled until it's checked. Consider also offering a .txt download in addition to copy.

### No data-export affordance before Erase my account

`frontend/apps/candidate/components/settings/privacy-tab.tsx:106` — `missing-feature` · effort `M` · group `onboarding-profile-account` **[needs BE]**

**Detail.** GDPR right-to-portability is distinct from right-to-erasure; a user who wants to move to another platform currently has to either take screenshots of /profile or hand-copy the data before clicking the destructive button. The whole tab is titled 'Privacy' and this is the natural home for an export link.

**Fix.** Add an 'Export my data' card above 'Delete my data' that calls a backend export endpoint (or, as an interim, downloads the profile + consents JSON produced from the existing `profile.getProfile` + `compliance.getMyConsent` reads).

### Profile age field treats 0 as valid — sends 0 to server when user clears the input

`frontend/apps/candidate/app/profile/page.tsx:431` — `correctness` · effort `S` · group `onboarding-profile-account` **[needs BE]**

**Detail.** `value={form.age || ""}` + `onChange={(e) => update({ age: Number(e.target.value) })}` — clearing the age field gives Number('') === 0, and the save mutation sends `age: 0` (line 199). The input's own `min={16}` is bypassed because HTML min doesn't block submission for `type=number`; the backend now receives an out-of-range value on every 'user cleared then saved'.

**Fix.** Store age as `number | null`, use `age: e.target.value === '' ? null : Number(e.target.value)`, and send `age: form.age ?? undefined` to the RPC. Also add a `required` marker or explicit 'Optional' label so blank age is understood.

### ObservabilityBoundary only recovery is window.location.reload() — no reset path

`frontend/apps/candidate/components/observability-boundary.tsx:58` — `error-handling` · effort `S` · group `root-home-shell`

**Detail.** Once `getDerivedStateFromError` flips `caught: true`, nothing resets it back to false. The fallback's only escape is `window.location.reload()`, which discards the QueryClient cache, form drafts, and any un-persisted state built up in this session. A transient render error (lazy chunk load race, stale prop shape after a hot deploy) that a simple re-render would clear now costs the user everything in memory.

**Fix.** Add a `this.setState({ caught: false })` handler on a 'Try again' button before falling through to a 'Reload page' secondary. Attempts the local recovery first; if the error is deterministic and re-throws, the boundary immediately re-catches and the reload button is the fallback.

### HomeClient renders blank while redirecting a signed-in user with the wrong role

`frontend/apps/candidate/app/page-client.tsx:33` — `ux` · effort `S` · group `root-home-shell`

**Detail.** `if (mounted && token) return identity?.role === 'candidate' ? <Dashboard /> : null;` — a candidate-app localStorage token that decodes to a non-candidate role (e.g. a recruiter's stale token from a shared device) triggers useRequireRole's redirect to /login, but the render returns `null` during the same paint. User sees a blank white screen for at least one paint before navigation happens (router.replace is queued in an effect after the current render).

**Fix.** Return the marketing landing (`children`) instead of `null` in the wrong-role branch. The landing already SSR'd, so no extra cost and no blank flash: `if (mounted && token && identity?.role === 'candidate') return <Dashboard />;` then fall through to `return <>{children}</>;`.

## P3-polish

### /applications/[id] fetches the whole applications list to find one row

`frontend/apps/candidate/app/applications/[id]/page.tsx:130` — `performance` · effort `S` · group `applications-messaging` **[needs BE]**

**Detail.** The page calls `api.applications.listMyApplications({})` and does `.find(a => a.applicationId === id)` (line 139). Warm cache from the dashboard makes this free, but a direct link (email deep-link, share) forces a full-list pull; response scales with the candidate's total application count. Comment (line 3) notes there's no GetMyApplication RPC yet — so this is a known gap, not oversight. Also polls every 10s while any application is non-terminal, even if only *this* one is terminal.

**Fix.** When BE adds GetMyApplication, switch to per-id fetch. Meanwhile, tighten the 10s poll: `refetchInterval` should key off `!TERMINAL_STATES.has(app.state)` for this application only, not the whole list.

### Missing loading.tsx across all audited route groups — blank frame before skeleton

`frontend/apps/candidate/app/applications/[id]/page.tsx` — `loading-state` · effort `S` · group `applications-messaging`

**Detail.** None of applications/, applications/[id]/, applications/[id]/outcome/, messages/, messages/[applicationId]/, feedback/[id]/, notifications/ has a `loading.tsx`. On cold navigation the browser paints nothing until the client component mounts, hydrates, and then renders its useQuery isLoading fallback. On slow mobile connections this is a visible blank frame before the skeleton lattice these pages otherwise carry inline.

**Fix.** Add a shared `<CandidateShell><Skeleton className="h-64 rounded-2xl" /></CandidateShell>`-style loading.tsx per route group (or a single one at app/loading.tsx if the shell is stable). Cheap. Next.js streams it as the Suspense boundary while the RSC + client bundle warm up.

### SSO callback ignores OAuth error_description - user sees generic failure

`frontend/apps/candidate/app/auth/callback/page.tsx:57` — `error-handling` · effort `S` · group `auth-flows`

**Detail.** When the provider returns #error=access_denied&error_description=User+denied+consent, the callback shows only 'Sign-in failed. Please try again.' The standard error_description and error code are dropped. Support tickets get no context; users repeat the same failing action.

**Fix.** Include both when present: const desc = params.get('error_description'); const code = params.get('error'); setError(desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : `Sign-in failed (${code}). Please try again.`);

### Reset page flashes a disabled form for one paint before the invalid-link view

`frontend/apps/candidate/app/reset/page.tsx:43` — `loading-state` · effort `S` · group `auth-flows`

**Detail.** useState<string | null>(null) + a mount effect to setToken(sp.get('token') ?? '') was written to 'avoid SSR mismatch' but the page is already inside <Suspense fallback={null}>, so useSearchParams is safe to read synchronously. The current pattern renders the password form with disabled inputs on the first paint, then swaps to the invalid-link screen when the effect runs - a visible flash that also hides the real error state from a user who tabs away in that fraction of a second.

**Fix.** Replace the state + effect with const token = sp.get('token') ?? '' - one line, no flash, no unnecessary re-render.

### Verify page useRef guard blocks re-verify when the URL token changes on the same mount

`frontend/apps/candidate/app/verify/page.tsx:50` — `correctness` · effort `S` · group `auth-flows`

**Detail.** called.current = true is set on first run and never reset. If the user is on /verify?token=A and client-navigates to /verify?token=B without unmounting (e.g. clicking a fresh verification link from another tab that opens in the same window), the effect re-runs (sp changed), the ref-guard early-returns, and token B is never verified. The user stays on the 'ok' state from token A or the previous error state.

**Fix.** Key the guard by token: const lastToken = useRef<string | null>(null); if (lastToken.current === token) return; lastToken.current = token;. Also reset status to 'working' when the token changes.

### Login/register/forgot email fields have no autoFocus

`frontend/apps/candidate/app/login/page.tsx:92` — `ux` · effort `S` · group `auth-flows`

**Detail.** The first field on every dedicated auth screen - sign in, sign up, forgot - requires a click before typing. On desktop this is a 500ms tax; on mobile it wastes a keyboard-open cycle. Field has no autoFocus support.

**Fix.** Add autoFocus?: boolean to Field and set it on the email input in /login, /register, /forgot. Reset flow's first field is 'password' - set it there too when token is present.

### Forgot 'try a different email' does not clear the input

`frontend/apps/candidate/app/forgot/page.tsx:64` — `ux` · effort `S` · group `auth-flows`

**Detail.** The 'try a different email' button only flips sent back to false; the previously typed email is still in state and shown pre-filled in the field. Users have to manually clear before typing the actual different email - precisely the friction the button is offering to avoid.

**Fix.** onClick={() => { setEmail(''); setSent(false); }}.

### Waitlist reimplements a Field component instead of using the shared one

`frontend/apps/candidate/app/waitlist/page-client.tsx:118` — `refactor` · effort `S` · group `auth-flows`

**Detail.** page-client.tsx defines a local Field with the same responsibilities as components/auth/auth-card.tsx#Field - label, required asterisk, styled input, id wiring. Two implementations of the same primitive drift over time (already: waitlist uses focus:ring-4 focus:ring-brand-soft, auth-card uses focus:ring-2 focus:ring-brand/45).

**Fix.** Either export Field from @ip/ui (waitlist already imports MarketingShell from there) or import it from ../../components/auth/auth-card. Delete the local duplicate; if the visual difference is intentional, add a size='marketing' prop to the shared one.

### Company registration lacks confirm-password and client-side length check

`frontend/apps/candidate/app/company/register/page.tsx:89` — `error-handling` · effort `S` · group `company-recruiter`

**Detail.** Form uses noValidate on the <form> (line 57) which disables HTML5 constraints, and the submit handler only checks !password || !companyName.trim() || !email.trim() (line 89). A 3-character password submits and only the server rejects. No confirm-password field means typos block the recruiter from ever signing in with the same string. Every other registration path in the workspace (invite dialog, onboarding) has explicit length validation.

**Fix.** Add password.length < 8 guard in onSubmit before mutating, mirror the errors pattern from the team invite dialog for inline messaging, and add an optional 'Confirm password' field with strict equality check before submit.

### Settings tabs read ?tab= only at mount and never sync URL on tab clicks

`frontend/apps/candidate/app/company/settings/page.tsx:30` — `ux` · effort `S` · group `company-recruiter`

**Detail.** <Tabs defaultValue={initial}> — defaultValue is uncontrolled, baked at mount. Deep-linking to ?tab=security works on first load, but clicking a tab does not update the URL, so refreshing or sharing the link always lands on Account. Symmetrical bug on candidate settings, but recruiter-side Team/Billing links get shared often.

**Fix.** Make Tabs controlled: track active via useState seeded from the search param, push router.replace(`/company/settings?tab=${next}`) in onValueChange. Ensures URL is always the source of truth.

### Jobs list table advertises applicant counts and Close action it never renders

`frontend/apps/candidate/app/company/jobs/page.tsx:14` — `missing-feature` · effort `M` · group `company-recruiter` **[needs BE]**

**Detail.** The file header comment promises 'applicant counts, and per-row actions (Edit / Pipeline / Close)'. The rendered table has only Role/Status/Posted/Actions columns and only Edit + Pipeline actions. No applicant-count column exists, and there is no way to close a published job from the list — Close, Pause, or Publish transitions require diving into the edit page (which itself only has Publish, no Close). Given the sidebar promises status management, this is a functional gap not a docs bug.

**Fix.** Add an Applicants column driven by listApplicants (or a counts RPC) and add row-level Publish/Pause/Close ConfirmDialogs backed by api.jobs.publishJob / pause / close (add the RPCs if missing). Alternately, delete the promise from the header comment and move status transitions into the edit screen with a status Select.

### addToCalendar revokes ObjectURL synchronously after a.click()

`frontend/apps/candidate/app/schedule/page.tsx:74` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** URL.revokeObjectURL(a.href) fires on the same tick as a.click() (lines 73–74). Modern Chrome/Firefox capture the URL at click, but Safari and some older WebViews have historically cancelled downloads if the URL is revoked before the fetch begins. Also the <a> element is never appended to the DOM — a.click() works in current browsers but is technically implementation-defined.

**Fix.** Defer the revoke: setTimeout(() => URL.revokeObjectURL(url), 0). Optionally document.body.appendChild(a); a.click(); a.remove(); for older-browser safety.

### JobDetailSidebar uses a raw apostrophe inside JSX text

`frontend/apps/candidate/app/jobs/[id]/job-detail-sidebar.tsx:92` — `correctness` · effort `S` · group `jobs-discovery`

**Detail.** Line 92: `See {job.company.name}'s profile →` — the raw ' trips react/no-unescaped-entities (a rule the rest of the codebase honors, e.g. schedule/alerts pages use &apos;). If ESLint is on strict rules, this file will fail lint.

**Fix.** Either escape (`&apos;s profile`) or template-string it (`{`See ${job.company.name}'s profile →`}`). Consistent with alerts/schedule.

### Saved 'Show more' doesn't shift focus to newly revealed items

`frontend/apps/candidate/app/saved/page.tsx:139` — `a11y` · effort `S` · group `jobs-discovery`

**Detail.** Clicking 'Show more' at line 139 increments shown but the button remains focused (or if it disappears when shown >= jobs.length, focus is dumped to document.body). Keyboard users lose context.

**Fix.** On expand, focus the first newly revealed SavedJobCell (e.g. via a ref array or a querySelector on the new index). If the button is the last one to disappear, forward focus to the last visible cell.

### MarketingShell is "use client" — nav + footer ship as client JS on static legal pages

`frontend/packages/ui/src/aperture-chrome.tsx:1` — `performance` · effort `M` · group `marketing-legal-trust`

**Detail.** The entire aperture-chrome.tsx module (MegaNav, MegaFooter, MarketingShell — ~330 lines with a lot of inline SVG and audience arrays) is marked "use client" because MegaNav needs `useState` for the mobile menu toggle. That forces every RSC page rendering `<MarketingShell>` (privacy, terms, dpa, trust, status, ai-explainability, what-we-dont-do, accessibility) to hydrate the full chrome even though nothing on those pages needs interactivity beyond the burger.

**Fix.** Split: keep MegaNav/MegaFooter as server components rendering all links + SVG, and extract only the burger + mobile drawer into a tiny `<MobileMenuToggle />` client island. MarketingShell can then be a server component too, which removes it from the client bundle of every static page and helps LCP on the marketing surfaces.

### DPA subprocessors section refers to /privacy as plain text, not a link

`frontend/apps/candidate/app/dpa/page.tsx:29` — `correctness` · effort `S` · group `marketing-legal-trust`

**Detail.** `<LegalPlaceholder>List of authorised subprocessors maintained at /privacy under Subprocessors.</LegalPlaceholder>` — a reader on the DPA has to manually retype the URL to find the list. `/privacy` has an id="subprocessors" section id ready to be anchored (privacy/page.tsx line 99).

**Fix.** Wrap in `<Link href="/privacy#subprocessors" className="text-brand-strong">/privacy under Subprocessors</Link>`. One-line change.

### /account uses client-side redirect that flashes LoadingState

`frontend/apps/candidate/app/account/page.tsx:9` — `performance` · effort `S` · group `onboarding-profile-account`

**Detail.** The page renders a 'use client' component that mounts, runs `router.replace` in an effect, and shows a LoadingState in the meantime — every visit ships a JS bundle, hydrates, then navigates. `/account` is a permanent alias with zero dynamic logic.

**Fix.** Delete `app/account/page.tsx` and add `{ source: '/account', destination: '/settings?tab=privacy', permanent: true }` to `next.config.js` redirects (or a server-component `redirect()` call for a 307). Zero JS, zero paint.

### Session list 'Last active' rounds sub-day intervals to 'today'

`frontend/apps/candidate/components/settings/session-list.tsx:24` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** `rel()` divides by DAY_MS then formats with unit 'day' — a session active 20 seconds ago and one active 20 hours ago both render as 'today'. For a security-review UI where recency is the whole signal (spotting a rogue login), losing sub-day granularity hurts the primary user job.

**Fix.** Pick the appropriate unit dynamically: if delta < 1h, format minutes; if < 24h, hours; else days. A ~15 line helper covering minute/hour/day/week is enough.

### Password change confirm-field error text placed under wrong field

`frontend/apps/candidate/components/settings/account-tab.tsx:107` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** `error={confirm && pwError ? pwError : null}` mounts every error string — including 'New password must be at least 8 characters' — under the Confirm field. A user with a short new-password and matching confirm sees the length error attached to Confirm, which is confusing.

**Fix.** Split the error: pass length errors to the 'New password' Field, mismatch errors to the Confirm Field. `passwordChangeError` already differentiates them internally; make it return `{ next?: string, confirm?: string }` instead of a single string.

### Notification quiet-hours timezone limited to a hardcoded 8-entry list

`frontend/apps/candidate/components/settings/notifications-tab.tsx:35` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** TIMEZONES is a fixed 8-item list (UTC, NY, LA, London, Berlin, Kolkata, Singapore, Sydney). A candidate in São Paulo, Tokyo, Dubai, Toronto etc. can't pick their tz, so quiet hours effectively don't work correctly for them — a P3 for the audit but a functional gap for the underlying feature.

**Fix.** Use `Intl.supportedValuesOf('timeZone')` (available in every modern engine) as the option list, with the current 8 as a 'Common' group at the top.

### Session revoke fires immediately with no confirmation

`frontend/apps/candidate/components/settings/session-list.tsx:88` — `ux` · effort `S` · group `onboarding-profile-account`

**Detail.** The per-row 'Revoke' Button calls `revoke.mutate(s.jti)` on click. A single misclick signs out that device with no undo. The bulk 'Sign out other sessions' already uses ConfirmDialog — the per-row path should for consistency and safety.

**Fix.** Wrap the per-row Revoke Button in `<ConfirmDialog trigger={...} title="Revoke this session?" description="That device will be signed out." confirmLabel="Revoke" onConfirm={() => revoke.mutate(s.jti)}>`.

### HomeClient duplicates the `ready` signal with a redundant `mounted` state

`frontend/apps/candidate/app/page-client.tsx:26` — `refactor` · effort `S` · group `root-home-shell`

**Detail.** `useAuth()` already returns `ready` (packages/shared/src/auth.tsx line 86-91), which flips true after the persisted token has been read post-mount — the same guarantee `mounted` provides here. The extra `useState + useEffect` on lines 26-27 is duplicated state. Because token can never be non-null before `ready`, `mounted && token` is equivalent to `ready && token`.

**Fix.** Delete `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`. Replace the `mounted && token` guard with `ready && token`.

### page.tsx re-declares metadata already set (identically) in layout.tsx

`frontend/apps/candidate/app/page.tsx:4` — `dead-code` · effort `S` · group `root-home-shell`

**Detail.** layout.tsx already sets `title: 'Aptura — Get seen. Get interviewed. Get hired.'` and description. page.tsx lines 4-8 re-export a near-identical metadata block that overrides layout.tsx with the same title (different-but-similar description). Two sources of truth for the same value; changing one leaves the other stale.

**Fix.** Delete the metadata export in app/page.tsx. If the marketing landing needs a different description than the app-wide default, keep the export but drop the redundant `title` — Next merges partial metadata.

### Dashboard useCallback([withdraw]) has unstable dep — memo is dead code

`frontend/apps/candidate/components/dashboard.tsx:148` — `dead-code` · effort `S` · group `root-home-shell`

**Detail.** `withdraw` is the object returned by `useMutation`, which is a fresh reference on every render. `useCallback(cb, [withdraw])` therefore recomputes each render, defeating the stated purpose ('Stable callback for the application rows so memoized children don't re-render'). Compounding the issue, `DashboardApplicationRow` in dashboard-parts.tsx is NOT wrapped in `React.memo`, so it re-renders regardless — the callback memoization is theatre.

**Fix.** Either (a) depend on `[withdraw.mutate]` (stable in TanStack Query v5) and wrap `DashboardApplicationRow` in `React.memo`, or (b) drop the `useCallback` entirely and inline `(id) => withdraw.mutate(id)` — the current setup pays the memo cost with none of the benefit.

### KPI section aria-label mismatches its visible 'At a glance' eyebrow

`frontend/apps/candidate/components/dashboard.tsx:188` — `a11y` · effort `S` · group `root-home-shell`

**Detail.** The section carries `aria-label='At-a-glance'` (line 188) yet also renders a visible `<p className='ap-eyebrow'>At a glance</p>` (line 191) that is not a heading. Screen readers announce only the aria-label ('At-a-glance', hyphenated); sighted users see 'At a glance' (spaced). If the eyebrow is intended as the label, use aria-labelledby to point at it; otherwise the aria-label should match the visible copy exactly.

**Fix.** Give the `<p>` an id and swap the section attribute to `aria-labelledby='kpi-eyebrow'`, or just make the aria-label match the visible text: `aria-label='At a glance'`.

### withdraw.isPending is broadcast to every row's ConfirmDialog busy prop

`frontend/apps/candidate/components/dashboard.tsx:285` — `ux` · effort `S` · group `root-home-shell`

**Detail.** `withdrawing={withdraw.isPending}` broadcasts one shared mutation's pending state to every row. If the user opens a confirm dialog on row A, confirms, then quickly opens a confirm dialog on row B while A is still in flight, row B's confirm button already reads as busy despite no action having been taken on it — the visual state is disconnected from the row the user is looking at.

**Fix.** Track the pending application id (`withdraw.variables` gives you the last id passed) and only mark the row busy when `withdraw.isPending && withdraw.variables === app.applicationId`.
