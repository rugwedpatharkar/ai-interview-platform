# Screen: Auth restyle (split layout) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 0, reposition + foundation).
> **Routes:** `frontend/apps/{candidate,company}/app/{login,register,verify,forgot,reset}/page.tsx` (restyle existing) · **Mockup:** the `AuthSplitPanel` split layout · **Pillar:** [screens-frontend-build-plan §B](../../v2/2026-06-19-screens-frontend-build-plan.md)
> **Goal:** Restyle the existing auth screens to a **two-pane split layout** — form on the left, a `--gradient-brand` `AuthSplitPanel` (aperture + the proctored tagline) on the right — **reusing the existing auth logic verbatim**. Presentational only; zero behavior change.

This is a **pure presentational restyle**. The auth flows (`Auth.*` gRPC, the OAuth providers endpoint, the silent-refresh transport) already work and ship today. We wrap the existing `CredentialsForm` / register / verify / forgot / reset bodies in a shared `AuthLayout` that adds the gradient panel beside them. **No new client, no new query, no new field.**

---

## A. Backend contract (hand this to a backend session)

**Status:** EXISTING (nothing new) · **Service:** `admin` `AuthService` (gRPC-web) + the OAuth REST endpoint — all already built and consumed today.

The screens already call these via the existing wiring; this restyle changes **none** of it. Listed for completeness (the screen consumes exactly these, unchanged):

- **`api.auth.registerCandidate({ email, password })`** → candidate `register` (wired in `apps/candidate/lib/auth.tsx` as the `makeAuth` `register` config). Response: the auth tokens / identity (handled inside `makeAuth`).
- **`api.auth.registerCompany({ companyName, email, password })`** → company register (called directly in `apps/company/app/register/page.tsx`, since company register needs a `companyName`; no `register` config on the company `makeAuth`).
- **`login(email, password)`** (from `useAuth()`) → `AuthService.Login`; the `makeAuth`-provided closure stores tokens + sets `identity`.
- **`logout()`** (from `useAuth()`) → clears the token store.
- **Verify / forgot / reset** → the existing `Auth.*` RPCs the current `verify`/`forgot`/`reset` pages already call (e.g. verify-email, request-password-reset, reset-password) **plus** `resendVerification` (exported from `@ip/shared`, already wired into the verify UI per the recent `FE-D` commit). Response shapes are whatever those pages already render — unchanged.
- **OAuth providers** → `GET ${ADMIN_URL}/auth/oauth/providers` → `{ providers: string[] }` (consumed by the existing `SsoButtons`; renders nothing when empty). Authorize redirect → `GET ${ADMIN_URL}/auth/oauth/authorize?provider=<p>&redirect=<thisApp/auth/callback>`. **Unchanged** — `SsoButtons` is reused verbatim.

- **Auth/scope:** the auth endpoints are the unauthenticated entry points (login/register/verify/forgot/reset are pre-token by definition); OAuth providers is public.
- **Backed by:** the existing `AuthService` servicer + OAuth dispatcher. **No proto delta, no new collection, no new endpoint.**
- **FE mock shape:** none — there is no new contract. The restyle binds to the **existing** `useAuth()` / `api.auth.*` / `SsoButtons` / `resendVerification`.

> **Contract seam:** there is no seam to mock. The work is entirely in the presentational layer (`AuthLayout` + `AuthSplitPanel`); the `action` callbacks (`login`, `api.auth.register*`, verify/forgot/reset handlers) are passed through **unchanged** from the existing pages.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/packages/ui/src/auth-split-panel.tsx` (the gradient brand panel — shared, in `@ip/ui` so both apps + all 5 routes use one source) + export from `frontend/packages/ui/src/index.ts`
- Create: `frontend/packages/ui/src/auth-layout.tsx` (the two-pane shell: `{children}` left, `<AuthSplitPanel/>` right; panel collapses above the form on mobile) + export
- Modify: `frontend/apps/candidate/components/credentials-form.tsx` → wrap its body in `<AuthLayout>` (remove the local `min-h-screen max-w-md` centering; the layout owns the frame). **Logic unchanged.**
- Modify: `frontend/apps/company/components/credentials-form.tsx` → same (the company copy is identical structurally — confirm and apply the same wrap).
- Modify: `frontend/apps/{candidate,company}/app/register/page.tsx` → wrap the register `Card`/form in `<AuthLayout>`. **Logic unchanged** (candidate register goes through `CredentialsForm`+`register`; company register is the standalone form with `companyName`).
- Modify: `frontend/apps/{candidate,company}/app/{verify,forgot,reset}/page.tsx` → wrap each existing body in `<AuthLayout>`. **Logic unchanged.**
- Create: `frontend/packages/ui/src/auth-split-panel.test.tsx` (renders the proctored tagline; a11y-hidden aperture)

**Components:** new `AuthSplitPanel` + `AuthLayout` (both in `@ip/ui`); **reuse** existing `CredentialsForm`, `SsoButtons`, `Logo`/`LogoMark`, `Card`, `Field`, `Input`, `Button`, `Alert`. Icons via `lucide-react` (or the `LogoMark` aperture SVG already in `@ip/ui`).
**Query keys:** none (no data).
**`--gradient-brand`:** the `AuthSplitPanel` is a marketing-adjacent surface → gradient **allowed** (it's the brand panel; the form pane stays flat).

> **Restyle discipline (the whole point):** do **not** touch any `useState`, `useMutation`, `action`, `router.push`, or RPC call in the existing pages. The diff per page should be: an added `<AuthLayout>` wrapper + removal of the now-redundant `min-h-screen`/centering wrapper. If a page's diff touches a handler, **stop** — that's out of scope. (Per the global rule: behavior preservation; presentational restyle only.)

### Task 1: `AuthSplitPanel` (the gradient brand panel) — TDD

- [ ] **Step 1: Write the failing test** — `frontend/packages/ui/src/auth-split-panel.test.tsx`. Locks the proctored tagline + the decorative-aperture a11y:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthSplitPanel } from "./auth-split-panel.js";

describe("AuthSplitPanel", () => {
  it("shows the proctored, fair, merit tagline", () => {
    render(<AuthSplitPanel />);
    expect(screen.getByText(/No ghosting\. Proctored & fair\. Judged on merit\./i)).toBeInTheDocument();
  });
  it("does not use 'no surveillance' framing", () => {
    const { container } = render(<AuthSplitPanel />);
    expect(container.textContent?.toLowerCase()).not.toContain("surveillance");
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/ui test auth-split-panel` → FAIL (module missing). *(If `@ip/ui` lacks a test runner, mirror whatever the package already uses — there are existing `@ip/ui` components; check for a `test` script and `vitest`/jsdom; fold setup into this task if absent.)*
- [ ] **Step 3: Implement** `frontend/packages/ui/src/auth-split-panel.tsx`:
```tsx
import { LogoMark } from "./logo.js";

/** The right-hand brand panel of the split auth layout. Gradient brand surface
 * (violet→indigo) with the aperture mark + the proctored/fair/merit value line.
 * Fairness framing — focus/clarity, never a watching eye; no "surveillance" copy. */
export function AuthSplitPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] p-10 text-white lg:flex">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full border border-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full border border-white/10" />
      <LogoMark className="size-9 text-white" />
      <div className="relative">
        <p className="font-display text-3xl font-semibold leading-tight">
          Get seen. Get interviewed. Get hired.
        </p>
        <p className="mt-4 max-w-sm text-base text-white/85">
          No ghosting. Proctored &amp; fair. Judged on merit.
        </p>
        <ul className="mt-6 flex flex-col gap-2 text-sm text-white/80">
          <li>Every application gets an answer</li>
          <li>One proctored interview — same rules for everyone</li>
          <li>Evaluated on evidence, not pedigree</li>
        </ul>
      </div>
      <p className="relative text-xs text-white/60">© 2026 Aptura</p>
    </aside>
  );
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/ui test auth-split-panel` → PASS. *(Confirm `LogoMark` accepts a `className`; if its API differs, adapt — check `packages/ui/src/logo.tsx`.)*
- [ ] **Step 5: Export** — add `export { AuthSplitPanel } from "./auth-split-panel.js";` to `packages/ui/src/index.ts`.
- [ ] **Step 6: Commit** — `git commit -am "feat(auth): AuthSplitPanel brand panel (proctored tagline)"`.

### Task 2: `AuthLayout` (the two-pane shell)

- [ ] **Step 1:** Create `frontend/packages/ui/src/auth-layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { AuthSplitPanel } from "./auth-split-panel.js";

/** Split auth layout: the form pane (children) on the left, the brand panel on the
 * right. On <lg the panel is hidden (the form fills the screen, as today). The form
 * pane keeps the existing max-width + centering so the inner form is untouched. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main className="flex flex-col justify-center px-6 py-10">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
      <AuthSplitPanel />
    </div>
  );
}
```
- [ ] **Step 2: Export** — add `export { AuthLayout } from "./auth-layout.js";` to `packages/ui/src/index.ts`.
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/ui typecheck` → clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(auth): AuthLayout two-pane shell"`.

### Task 3: Restyle `CredentialsForm` (candidate + company login/register-via-form) — logic untouched

- [ ] **Step 1:** In `frontend/apps/candidate/components/credentials-form.tsx`, replace the outer `<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">…</main>` wrapper with `<AuthLayout>`. Keep **everything inside** (the `Logo` link, the `Card`, the `<form>`, all `useState`/`onSubmit`/`action`/`router.push`, the `footer` slot) **exactly as-is** — only the framing wrapper changes:
```tsx
// import:
import { /* …existing… */, AuthLayout } from "@ip/ui";

// return:
return (
  <AuthLayout>
    <Link href="/" className="mb-6 inline-flex" aria-label="Aptura home">
      <Logo size="lg" />
    </Link>
    <Card>
      {/* …the existing CardHeader/CardContent/form/footer, verbatim… */}
    </Card>
  </AuthLayout>
);
```
- [ ] **Step 2:** Apply the **same** wrap to `frontend/apps/company/components/credentials-form.tsx` (read it first to confirm it mirrors the candidate one; the company login page also relies on it). **Do not** change the company login page's `Suspense`/`NoticeAlert` logic — that stays in `app/login/page.tsx`; only the `CredentialsForm` frame changes.
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` (stop dev first) → clean. Preview both `/login` screens: form left, gradient panel right on desktop; panel hidden + form centered on mobile; **login still works** (submit → `router.push("/")`); `SsoButtons` still renders (when providers configured). Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(auth): split layout for login (CredentialsForm), logic unchanged"`.

### Task 4: Restyle register / verify / forgot / reset (both apps)

- [ ] **Step 1: Candidate register** — `apps/candidate/app/register/page.tsx` uses `CredentialsForm` (with the `register` action), so it inherits the split layout from Task 3 automatically. Confirm by preview; no edit needed unless it has its own wrapper.
- [ ] **Step 2: Company register** — `apps/company/app/register/page.tsx` is a **standalone** form (it needs `companyName` and calls `api.auth.registerCompany` + `login` directly). Wrap its existing `<main className="mx-auto flex min-h-screen max-w-md …">…</main>` body in `<AuthLayout>` (move the `Card` inside; drop the redundant centering `main`). **Keep** the `onSubmit`, the `registerCompany`→`login`→`router.push("/jobs")` flow, the `catch`→`/login?notice=account-created` fallback, and the `noValidate` form — verbatim.
- [ ] **Step 3: verify / forgot / reset (both apps)** — for each of the 6 remaining route files, read the existing page, then wrap its top-level body in `<AuthLayout>` (replacing any local `min-h-screen`/centering). These pages keep their own logic (verify reads the token + calls verify-email + offers `resendVerification`; forgot calls request-reset; reset reads the token + calls reset-password). **Touch only the framing wrapper.** If a page uses `VerifyCard` (`@ip/ui`), put `<VerifyCard/>` inside `<AuthLayout>` unchanged.
- [ ] **Step 4: Verify** — `--filter @ip/candidate build` + `--filter @ip/company build` clean. Preview each of register/verify/forgot/reset in both apps: split layout, mobile collapse, and the **flow still works** (register creates + routes; verify verifies + resend works; forgot sends; reset resets). Screenshot one per app.
- [ ] **Step 5: Commit** — `git commit -am "feat(auth): split layout for register/verify/forgot/reset (both apps), logic unchanged"`.

---

## C. States & acceptance
- **States:** the existing per-page states are **preserved unchanged** — login/register busy spinner (`Button loading`), the `Alert tone="danger"` error on failure, the company login `?notice=account-created` success `Alert`, the verify-page status states, the `SsoButtons` empty render (no providers) / rendered (providers present). The restyle adds **no new states**.
- **Responsive:** `lg:grid-cols-2` — desktop shows form + panel; below `lg` the `AuthSplitPanel` is `hidden` and the form pane fills the viewport (matching today's single-column auth). The form's own `max-w-md` is retained inside the left pane.
- **Dark mode:** the form pane uses tokens → automatic; the `AuthSplitPanel` stays violet in both themes (white text), like the landing brand bands.
- **A11y:** the aperture/ring motifs are `aria-hidden`; the form labels/`Field`s/`aria-label`s are unchanged; the `Logo` link keeps its `aria-label`; focus order is form-first (panel is decorative/`<aside>`).
- **Acceptance:** matches the split-layout mockup; the right panel reads **"No ghosting. Proctored & fair. Judged on merit."** (locked by the Task 1 test) with **no "surveillance" copy**; **every auth flow behaves identically to before** (login, register both apps, verify+resend, forgot, reset) — the diff is presentational only; `--filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/ui typecheck` green; `AuthSplitPanel`/`AuthLayout` live once in `@ip/ui` and are reused across all 5 routes in both apps.
