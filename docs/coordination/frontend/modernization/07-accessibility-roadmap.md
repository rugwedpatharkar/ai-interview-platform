# Accessibility roadmap

Only `accessibility` findings, grouped by WCAG 2.2 principle. Each cites its SC number.

---

## 1. Perceivable

### 1.2.2 (Captions – Prerecorded) — P1

**AY-8 · Interview session recording has no captions track**
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:717-728` · `components/interview-captions.tsx`
- Fix: `<track kind="captions" srcLang="en" default src={timeline.transcriptVttUrl}>` inside `<video>`.
- BE — expose `transcriptVttUrl` alongside `recordingUrl` on report/timeline RPC (already streamed via ProctorEvent live).

### 1.3.1 (Info and Relationships) — P2 / P3

**AY-12 · Radix Select inside bare `<label>` — label click doesn't focus trigger**
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:807-833` · `app/profile/page.tsx:445-460` · `packages/ui/src/field.tsx:11-68`
- Fix: use `@ip/ui` `<Field label="Reason" htmlFor="decide-reason">` OR `<label htmlFor="decide-reason">` + `<SelectTrigger id="decide-reason">`.

**AY-13 · NotificationItem is `<button>` that navigates — wrong semantic**
- `packages/ui/src/notification-item.tsx:60-84`
- Fix: change to `<a href={link ?? "#"} onClick={(e) => { if (!link) e.preventDefault(); onClick?.(); }}>`.

### 1.4.3 (Contrast – Minimum, AA 4.5:1) — P1

**AY-5 · Badge solid variant white-on-mid-luminance below 4.5:1**
- `packages/ui/src/badge.tsx:20-50` · `packages/ui/src/styles/tokens.css:40-42,117-130`
- Fix: add `--danger-strong` / `--success-strong` / `--info-strong` at L≈0.42–0.44 for solid-variant backgrounds. OR force outline variant on small text. Verify via Chrome DevTools contrast checker.

---

## 2. Operable

### 2.1.1 (Keyboard) — P2

**AY-10 · Integrity timeline pips use title-only tooltips — keyboard inaccessible**
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:664-686`
- Fix: `<button type="button" aria-label="{signalLabel(f.type)} at {new Date(f.at).toLocaleTimeString()}, {sevLabel(f.severity)}" onClick={() => scrollTo(articleRef.current[i])}>`. Wire click to scroll matching article + focus its heading.

### 2.4.1 (Bypass Blocks) — P1

**AY-3 · Interview + aptitude routes ship no skip-to-content link**
- `app/aptitude/[applicationId]/page.tsx:242,284` · `app/interview/[applicationId]/page.tsx:261` · `app/interview/[applicationId]/lobby/page.tsx:166` · `app/interview/[applicationId]/done/page.tsx:31` · `packages/ui/src/app-shell.tsx:98-103`
- Fix: extract `<SkipToContent targetId="main" />` into `@ip/ui`. Add to interview page, lobby, done, aptitude. Set `id="main" tabIndex={-1}` on each `<main>`.

### 2.4.2 (Page Titled) + 2.4.3 (Focus Order) — P1

**AY-6 · Route change no title announcement or focus reset**
- `app/template.tsx:6-8` · `app/providers.tsx:13-24` · `packages/ui/src/app-shell.tsx:148`
- Fix: `<RouteAnnouncer />` in `template.tsx`. On pathname change, push `document.title` into `aria-live="polite" aria-atomic="true" role="status"` visually-hidden region, move focus to `<main>` or first h1. Guard on `prefers-reduced-motion`.

**AY-11 · Onboarding step advance leaves focus on button, no live announcement**
- `app/onboarding/page.tsx:92,255-265,297-303,306-339`
- Fix: `stepHeadingRef = useRef<HTMLHeadingElement>(null)` on `<h1>`; `useEffect(() => { stepHeadingRef.current?.focus() }, [step])`. Add sr-only live-polite announcing step title on change.

### 2.4.3 (Focus Order) — P0

**AY-1 · Interview + aptitude countdown timers have no ARIA**
- `app/interview/[applicationId]/page.tsx:338` · `components/coding-section.tsx:58-62` · `lib/use-countdown.ts:22-60`
- Fix: (1) `useCountdown` returns `{display, secondsLeft}`. (2) Wrap both timer spans in `role="timer" aria-label="Time remaining"` / "Interview elapsed". (3) `<div role="status" aria-live="polite" className="sr-only">` announces "5 minutes remaining", "1 minute remaining", "30 seconds remaining", "10 seconds remaining" at threshold crossings; throttled by ref.

---

## 3. Understandable

### 3.3.1 (Error Identification) + 3.3.3 (Error Suggestion) — P0 / P2

**AY-2 · Auth Field lacks aria-invalid + aria-describedby across 7 auth screens**
- `components/auth/auth-card.tsx:88-148,150-174` · `app/login/page.tsx:98-135` · `app/register/page.tsx:62-100` · `app/forgot/page.tsx:80` · `app/reset/page.tsx:106` · `packages/ui/src/field.tsx:11-68`
- Fix: replace auth-card Field with `@ip/ui`'s Field (already injects aria-invalid + aria-describedby via cloneElement) OR extend auth-card Field with `error?: string` + linked `<p id="${id}-error" role="alert">`. Move focus to first invalid input on submit failure.

**AY-14 · Auth submit failure doesn't move focus or scroll to top Notice**
- `app/login/page.tsx:70-87,100` · `app/register/page.tsx:33-51,62-64` · `components/auth/auth-card.tsx:150-174`
- Fix: in each onSubmit catch after `setError`: `errorRef.current?.focus()` (add `tabIndex={-1}` to Notice) OR `scrollIntoView({block:'start', behavior:'smooth'})`. Combined with AY-2 covers both cases.

---

## 4. Robust

### 4.1.2 (Name, Role, Value) — P2

**AY-7 · Applicant detail uses `aria-pressed` buttons instead of `role="tab"`**
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:540-559,275` · `packages/ui/src/tabs.tsx` · `app/settings/page.tsx:39-73`
- Fix: swap for `@ip/ui` `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (already used in `/settings`). Delete local `TabButton`.

### 4.1.3 (Status Messages) — P0 / P1 / P2

**AY-1 · Timer announcements** — see under 2.4.3.
**AY-2 · Auth field error announcements** — see under 3.3.1.

**AY-4 · Alert always uses `role="alert"` — info + success banners interrupt screen readers**
- `packages/ui/src/alert.tsx:87-98`
- Fix: pick role by tone: `role="alert" aria-live="assertive"` for danger, `role="status" aria-live="polite"` for success/info/warning. Optional `announce={false}` escape hatch for danger alerts visible from initial paint.

**AY-6 · Route announcer** — see under 2.4.2.

**AY-9 · Company shell mounts no NotificationBell — recruiters lose announced unread count**
- `components/company-shell.tsx:149-176` · `components/candidate-shell.tsx:191` · `packages/ui/src/notification-bell.tsx:63-138`
- Fix: mount `<NotificationBell />` in `company-shell.tsx:154` next to DropdownMenu. Consider `filterItems` prop to drop candidate-only notification kinds on the recruiter side.

**AY-11 · Onboarding step announcement** — see under 2.4.3.
