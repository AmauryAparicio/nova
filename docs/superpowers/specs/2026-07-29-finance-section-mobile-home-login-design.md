# Finance Section — Mobile Home & Login Design

## Context

The mobile app (`apps/native`, Expo + expo-router + HeroUI Native/Uniwind) is currently a Better-T-Stack scaffold: its "home" route (`app/(drawer)/index.tsx`) shows a tRPC health-check demo and renders inline sign-in/sign-up forms when logged out. Auth (Better Auth) is already fully wired server-side and on both web/native clients, hard-restricted to a single allowed email (`packages/auth/src/lib/allowed-email.ts`) — this is a personal, single-user app. A finance domain schema (`packages/db/src/schema/`) was recently migrated (accounts, expenses, income, transfers, categories, installments, reimbursements, RAG embedding columns) but has **zero API routers or UI consuming it yet**.

The user wants to start building a "financial section" as part of a larger app that will eventually also have Documents, Calendar, and an AI assistant as sibling sections. This round scopes exactly two screens — Home and Login — plus the minimal backend needed to power them, and establishes the auth/navigation architecture the later sections will build on top of.

## Business Rules

1. **Single-user app** (unchanged): only `ALLOWED_SIGNUP_EMAIL` can sign up or sign in, enforced server-side in Better Auth `hooks.before`.
2. **Whole app requires authentication.** No screen renders without a valid Better Auth session — not just the Finance section.
3. **Unauthenticated → dedicated Login screen.** No inline forms embedded in Home anymore; no other unauthenticated content exists.
4. **Biometric app-lock on top of the session.** Even with a valid Better Auth session, the app requires a passing Face ID/fingerprint (or OS passcode fallback) check before showing protected content — checked on cold start and whenever the app returns to foreground from background.
5. **Fallback when no biometrics/passcode are enrolled on the device at all:** skip the lock (nothing to enforce). Don't dead-end the user.
6. **Sign-up stays available** in the Login screen (toggle with sign-in) even though only one email will ever succeed — existing server-side restriction is untouched.
7. **Home is a multi-section hub, not a Finance-only screen.** Today it renders one module — Finance (balance + recent activity) — built so Documents/Calendar/Assistant can be added as sibling modules later without restructuring.

## Architecture / Navigation

Mirrors the pattern web already uses (`apps/web/src/routes/_auth/route.tsx`: pathless layout + `beforeLoad` redirect), adapted to expo-router:

- **`app/login.tsx`** — new top-level route, outside the drawer. If a session already exists, redirect away from it (unauth-only route). Renders the existing `components/sign-in.tsx` / `sign-up.tsx` behind a toggle (moved out of the current demo home, not rebuilt).
- **`app/(protected)/`** — new route group wrapping the existing `(drawer)` content. Its `_layout.tsx`:
  - Reads `authClient.useSession()`. No session → `<Redirect href="/login"/>`.
  - Session exists → renders a `BiometricGate` wrapper that tracks a `locked` boolean, re-checked on cold start and on `AppState` foreground transitions (genuine external-system sync, justifies a `useEffect`). While locked, shows a lock screen (icon + "Unlock" affordance) instead of the drawer content. On pass, renders the drawer as normal.
- The existing `(drawer)` layout (Home/Tabs/Todos) moves under `(protected)/`, unchanged structurally.

**New dependency (approved):** `expo-local-authentication` in `apps/native` — the standard Expo SDK module for biometric/passcode checks; operates purely client-side and does not interact with the Better Auth session it sits on top of.

## Screens

### Login (`app/login.tsx`)

- Toggle between sign-in and sign-up, reusing the existing `components/sign-in.tsx` and `components/sign-up.tsx` (already built: `@tanstack/react-form` + zod + `heroui-native` toasts). No new form logic needed.
- On successful auth, no manual navigation needed — the `(protected)` guard picks up the new session and renders the app.
- Wrong/disallowed email still surfaces the existing server-side "Access is restricted" error via the current toast handling.

### Home hub (replaces current `app/(drawer)/index.tsx` demo content, now under `(protected)/(drawer)/`)

- Header/greeting area.
- **Finance module** (the only module built this round):
  - **Total Balance** — net sum (`initialAmount` + net of income/expenses/transfers) across all `isActive` accounts in the default currency (MXN), including negative balances such as credit cards/loans (`isExpenseAccount` accounts are included in the sum as-is, not excluded — a credit card's negative balance reduces the total, matching a standard net-worth view). Accounts in other currencies are excluded from this MVP sum; true multi-currency aggregation is explicitly deferred, not part of this design.
  - **Recent Activity** — last 5 records merged across expenses/income/transfers, each showing title, relative date, and signed/color-coded amount (green income, red expense — matching the existing "Gráficos para Finanzas" chart palette convention already defined for web in `packages/ui/src/styles/globals.css`, replicated as Uniwind/Tailwind color values on mobile, not shared components).
  - All amount/date formatting happens server-side (thin-client rule) — the client renders display-ready strings.
  - **No "View all" link/action yet** — there are no finance detail screens (accounts list, transaction list, add expense, etc.) in this round, so this would dead-end. Intentionally omitted rather than stubbed.
- Layout leaves room for sibling modules (Documents, Calendar, Assistant) to be added later; no placeholder UI for them is built now (YAGNI).

## Backend

- One new `protectedProcedure`, e.g. `finance.getHomeSummary`, in `packages/api` (new `finance.router.ts`, following the existing `todo.ts` router's pattern).
- Query logic lives in a finance-domain module under `packages/db` (per the "modular DB logic by domain" rule), not inline in the router.
- Target a single DB round trip; where Drizzle's relational API would force multiple queries (e.g. merging `expense`/`income`/`transfer` into one recent-activity feed), prefer the raw `sql` escape hatch (e.g. a `UNION ALL` across the three tables) per the project's stated performance rules.
- Explicit field selection only — no `select *`.
- Read-only summary query; no transaction needed (transactions are for writes).

## Out of scope for this design

- Documents, Calendar, Assistant sections (future sibling modules).
- Finance detail screens: accounts list, transaction list/detail, add/edit expense or income, categories, transfers, reimbursements, installments.
- True multi-currency balance aggregation.
- Web-side finance UI (schema exists but this design is mobile-only).
- Budgets/recurring transactions (not modeled in the schema yet).

## Verification

- Fresh unauthenticated launch lands on `/login`; no protected content is reachable first.
- Signing in with the allowed email redirects into `(protected)` → Home hub, Finance module shows real balance/activity from seeded data.
- Signing in with a different email is rejected server-side ("Access is restricted"), confirming the existing rule is untouched.
- Backgrounding then resuming the app triggers a biometric prompt before content is visible; cancelling keeps it locked, succeeding unlocks it.
- On a simulator/device with no biometrics or passcode enrolled, the lock is skipped with no dead-end.
- `bun x ultracite check` and the per-app typecheck/lint/build CI (added in `bf24cd1`) pass.
