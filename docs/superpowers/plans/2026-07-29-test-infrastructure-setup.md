# Test Infrastructure Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give this repo real, working test tooling — Vitest for `packages/api`, `packages/db`, and `apps/web` unit tests; Playwright for `apps/web` e2e; `jest-expo` + React Native Testing Library for `apps/native` unit/component tests; Maestro for `apps/native` e2e — each wired into `turbo.json` and CI, each proven with one real smoke test.

**Architecture:** Two test runners, matched to environment: Vitest for everything that runs on Node/Bun (server-side packages, and the web app's jsdom-based component tests), Jest (`jest-expo` preset) for React Native component tests since Vitest has no mature RN support. Two e2e tools: Playwright drives a real browser against `apps/web`; Maestro drives a real Android emulator against `apps/native` — Playwright cannot exercise native code paths (confirmed with the user: it would only reach `apps/native` via its `react-native-web` build, which never touches `expo-local-authentication`'s real biometric APIs, the exact behavior a later finance-app design depends on). Unit tests are wired into the existing `turbo run <task> --filter=<app>` matrix in CI; e2e tests get their own CI jobs since they need a live server / emulator, not just a Node process.

**Tech Stack:** Vitest (`^4.x`), `@playwright/test` (`^1.x`), `jest` (`^29.7.0`) + `jest-expo` (`~57.0.0`, matching this repo's other `expo-*` package pins) + `@testing-library/react-native`, Maestro CLI (installed via shell script, not npm).

## Global Constraints

- Bun workspaces + Turborepo monorepo; every new script/task must be invokable via `bunx turbo run <task> --filter=<app>`, mirroring the existing `lint`/`check-types`/`build` tasks in `turbo.json`.
- No `let`, no `any`, `const` by default, guard clauses over `else` (repo-wide TypeScript rules from `CLAUDE.md`).
- All new source/test files must pass `bun x ultracite check` (Biome/Ultracite) — no `console.log`, no `.only`/`.skip` in committed tests, assertions live inside `it()`/`test()` blocks per this repo's own documented testing conventions (`.claude/CLAUDE.md`).
- Shared cross-workspace dependency versions live in root `package.json`'s `catalog` block, referenced as `"catalog:"` from consuming packages (existing convention — see `drizzle-orm`, `better-auth`, `@trpc/*`). Single-app-only dependencies are pinned directly in that app's `package.json` (existing convention — see `typescript`, `vite`).
- New npm dependencies in this plan were explicitly approved by the user: `vitest`, `@playwright/test`, `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`. The Maestro CLI is a standalone binary (installed via `curl -Ls "https://get.maestro.mobile.dev" | bash`), not an npm package.
- Drizzle ORM safety: never run `db:push`/`db:migrate` — not touched by this plan (test tasks never hit a real database; the one query-layer test in `packages/db` only inspects pure, connection-free schema metadata).

---

### Task 1: Vitest in `packages/db` — schema smoke test

**Files:**
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/src/schema/financial-accounts.test.ts`
- Modify: `packages/db/package.json` (add `test` script + `vitest` devDependency)
- Modify: `package.json` (root — add `vitest` to `workspaces.catalog`)

**Interfaces:**
- Consumes: `financialAccount` table export from `packages/db/src/schema/financial-accounts.ts` (already exists — `accountType`, `createdAt`, `creditLimit`, `currency`, `deletedAt`, `description`, `iconName`, `id`, `initialAmount`, `isActive`, `isExpenseAccount`, `name`, `sortOrder`, `updatedAt`, `userId` columns).
- Produces: `bun run test` inside `packages/db` runs `vitest run`. This is the pattern Tasks 2–3 copy.

- [ ] **Step 1: Add vitest and get a resolved version**

```bash
cd packages/db && bun add -D vitest && cd ../..
```

- [ ] **Step 2: Move the resolved version into the root catalog**

In `package.json`, add `vitest` to `workspaces.catalog` (copy the exact version `bun add` just wrote into `packages/db/package.json`'s `devDependencies.vitest`), then in `packages/db/package.json` change `"vitest": "<resolved version>"` to `"vitest": "catalog:"`. Run `bun install` at the repo root afterward so the lockfile matches.

- [ ] **Step 3: Write `packages/db/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing-by-absence test**

```ts
// packages/db/src/schema/financial-accounts.test.ts
import { expect, it } from "vitest";

import { financialAccount } from "./financial-accounts";

it("maps financial_account columns to their snake_case db names", () => {
  expect(financialAccount.name.name).toBe("name");
  expect(financialAccount.currency.name).toBe("currency");
  expect(financialAccount.isExpenseAccount.name).toBe("is_expense_account");
  expect(financialAccount.userId.name).toBe("user_id");
});
```

- [ ] **Step 5: Add the `test` script**

In `packages/db/package.json`, add to `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 6: Run it and verify it passes**

Run: `cd packages/db && bun run test`
Expected: PASS — 1 test, `financial_account columns` assertions all green. (There's no "red" phase here: this test exercises schema code that already exists and is correct — the point of this task is proving Vitest is wired up, not developing new behavior.)

- [ ] **Step 7: Commit**

```bash
git add packages/db/vitest.config.ts packages/db/src/schema/financial-accounts.test.ts packages/db/package.json package.json bun.lock
git commit -m "test: add vitest to packages/db"
```

---

### Task 2: Vitest in `packages/api` — router smoke test

**Files:**
- Create: `packages/api/vitest.config.ts`
- Create: `packages/api/src/routers/index.test.ts`
- Modify: `packages/api/package.json` (add `test` script, `"vitest": "catalog:"`)

**Interfaces:**
- Consumes: `appRouter` from `packages/api/src/routers/index.ts` (exports `healthCheck: publicProcedure.query(() => "OK")`, already exists).
- Produces: `bun run test` inside `packages/api` runs `vitest run`.

**Context for implementer:** importing `appRouter` transitively imports `packages/db/src/index.ts` (via `todo.ts`'s `import { db } from "@nova/db"`), which calls `createDb()` and reads `env.DATABASE_URL` through `@nova/env/server`. That env module throws on missing/invalid vars unless `SKIP_ENV_VALIDATION` is set. `createDb()` itself doesn't eagerly connect (Drizzle connects lazily on first query), so a dummy `DATABASE_URL` is enough to import the router safely — this test never issues a query.

- [ ] **Step 1: Add vitest (catalog reference, already resolved in Task 1)**

In `packages/api/package.json`, add to `"devDependencies"`: `"vitest": "catalog:"`.

- [ ] **Step 2: Write `packages/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      SKIP_ENV_VALIDATION: "1",
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write the test**

```ts
// packages/api/src/routers/index.test.ts
import { expect, it } from "vitest";

import { appRouter } from "./index";

it("healthCheck resolves OK through a router caller with no session", async () => {
  const caller = appRouter.createCaller({ auth: null, session: null });
  await expect(caller.healthCheck()).resolves.toBe("OK");
});
```

- [ ] **Step 4: Add the `test` script**

In `packages/api/package.json`, add to `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 5: Run it and verify it passes**

Run: `cd packages/api && bun run test`
Expected: PASS — 1 test.

- [ ] **Step 6: Commit**

```bash
git add packages/api/vitest.config.ts packages/api/src/routers/index.test.ts packages/api/package.json
git commit -m "test: add vitest to packages/api"
```

---

### Task 3: Vitest in `apps/web` — component smoke test

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/components/loader.test.tsx`
- Modify: `apps/web/package.json` (add `test` script, `"vitest": "catalog:"`)

**Interfaces:**
- Consumes: default export `Loader` from `apps/web/src/components/loader.tsx` (already exists, no props, no external providers needed).
- Produces: `bun run test` inside `apps/web` runs `vitest run`. `@testing-library/react`, `@testing-library/dom`, `jsdom`, and `@vitejs/plugin-react` are already present in `apps/web/package.json` devDependencies (leftover from the original scaffold) — reused as-is, no need to re-add them.

- [ ] **Step 1: Add vitest (catalog reference)**

In `apps/web/package.json`, add to `"devDependencies"`: `"vitest": "catalog:"`.

- [ ] **Step 2: Write `apps/web/vitest.config.ts`**

Kept separate from `vite.config.ts` on purpose: the app's main Vite config wires in TanStack Start's SSR/prerender plugin and Nitro, neither of which the unit-test runner needs or can use.

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Write the test**

```tsx
// apps/web/src/components/loader.test.tsx
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import Loader from "./loader";

it("renders a spinning loader icon", () => {
  const { container } = render(<Loader />);
  expect(container.querySelector(".animate-spin")).toBeTruthy();
});
```

- [ ] **Step 4: Add the `test` script**

In `apps/web/package.json`, add to `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 5: Run it and verify it passes**

Run: `cd apps/web && bun run test`
Expected: PASS — 1 test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src/components/loader.test.tsx apps/web/package.json
git commit -m "test: add vitest to apps/web"
```

---

### Task 4: Wire `test` into turbo + CI for all three Vitest workspaces

**Files:**
- Modify: `turbo.json` (add `test` task)
- Modify: `package.json` (root — add `test` convenience script)
- Modify: `.github/workflows/ci.yml` (add Test step to the existing matrix job)

**Interfaces:**
- Consumes: the `test` script added to `packages/db`, `packages/api`, `apps/web` package.json in Tasks 1–3.
- Produces: `bunx turbo run test --filter=<app>` runs that app's tests plus (via `dependsOn: ["^test"]`) its workspace dependencies' tests — e.g. `--filter=web` also runs `packages/api`'s and `packages/db`'s tests, since `apps/web` depends on `@nova/api` which depends on `@nova/db`. This mirrors how `lint`/`check-types` already cascade through the dependency graph.

- [ ] **Step 1: Add the `test` task to `turbo.json`**

```json
    "test": {
      "dependsOn": ["^test"]
    },
```

Add this alongside the existing `"lint"` and `"check-types"` entries in the `"tasks"` object.

- [ ] **Step 2: Add a root convenience script**

In root `package.json` `"scripts"`, add: `"test": "turbo run test"` (next to the existing `"build": "turbo run build"` line).

- [ ] **Step 3: Verify the full graph runs locally**

Run: `bunx turbo run test`
Expected: 3 tasks run (`@nova/db#test`, `@nova/api#test`, `web#test`), all PASS. `native`, `server`, `tui`, `docs` are silently skipped — none of them have a `test` script yet (native gets one in Task 6).

- [ ] **Step 4: Add the CI step**

In `.github/workflows/ci.yml`, add a new step to the existing `ci` job, after the `Typecheck` step:

```yaml
      - name: Test
        run: bunx turbo run test --filter=${{ matrix.app }}
```

- [ ] **Step 5: Commit**

```bash
git add turbo.json package.json .github/workflows/ci.yml
git commit -m "chore: wire test task into turbo and CI"
```

---

### Task 5: Playwright e2e for `apps/web`

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/smoke.spec.ts`
- Modify: `apps/web/package.json` (add `test:e2e` script, `@playwright/test` devDependency)
- Modify: `.github/workflows/ci.yml` (new `e2e-web` job)
- Modify: `package.json` (root — no catalog entry; Playwright is web-only)

**Interfaces:**
- Consumes: `apps/web`'s existing dev server (`bun run dev` → `vite dev` on port `3001`, per `apps/web/vite.config.ts`) and the existing `/` route (`apps/web/src/routes/index.tsx`, renders an `<h2>API Status</h2>` heading regardless of backend availability).
- Produces: `bun run test:e2e` inside `apps/web` runs `playwright test`.

- [ ] **Step 1: Add Playwright**

```bash
cd apps/web && bun add -D @playwright/test && bunx playwright install --with-deps chromium && cd ../..
```

- [ ] **Step 2: Write `apps/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    reuseExistingServer: !process.env.CI,
    url: "http://localhost:3001",
  },
});
```

- [ ] **Step 3: Write the smoke test**

```ts
// apps/web/e2e/smoke.spec.ts
import { expect, test } from "@playwright/test";

test("home page loads and shows the API status section", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "API Status" })
  ).toBeVisible();
});
```

- [ ] **Step 4: Add the `test:e2e` script**

In `apps/web/package.json`, add to `"scripts"`: `"test:e2e": "playwright test"`.

- [ ] **Step 5: Run it and verify it passes**

Run: `cd apps/web && bun run test:e2e`
Expected: PASS — Playwright starts the dev server, runs 1 test in Chromium, shuts the server down.

- [ ] **Step 6: Add the `e2e-web` CI job**

In `.github/workflows/ci.yml`, add a new top-level job (sibling to `ci`):

```yaml
  e2e-web:
    name: E2E (web)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium
        working-directory: apps/web

      - name: Run Playwright e2e tests
        run: bun run test:e2e
        working-directory: apps/web
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/smoke.spec.ts apps/web/package.json .github/workflows/ci.yml bun.lock
git commit -m "test: add playwright e2e to apps/web"
```

---

### Task 6: `jest-expo` + React Native Testing Library for `apps/native`

**Files:**
- Create: `apps/native/jest.config.js`
- Create: `apps/native/__tests__/smoke.test.tsx`
- Modify: `apps/native/package.json` (add `test` script, `jest`/`jest-expo`/`@testing-library/react-native`/`@types/jest` devDependencies)

**Interfaces:**
- Consumes: nothing from existing app source — deliberately. Every existing component in `apps/native` (`Container`, `ThemeToggle`) is coupled to `uniwind`'s `useUniwind()` runtime and/or `react-native-safe-area-context`, neither of which has confirmed, documented Jest-mocking support as of this stack's versions. Rather than guess at mocks that might silently produce a false pass or a flaky failure, this smoke test renders only React Native core primitives (`Text`), which `jest-expo`'s underlying `@react-native/jest-preset` supports natively.
- Produces: `bun run test` inside `apps/native` runs `jest`. Testing components that use `uniwind`/`heroui-native` is deferred to whichever plan first builds a screen with them (any mocks those need can be added then, verified against a real render instead of guessed here).

- [ ] **Step 1: Add the dependencies**

```bash
cd apps/native && bun add -D jest jest-expo @testing-library/react-native @types/jest && cd ../..
```

- [ ] **Step 2: Write `apps/native/jest.config.js`**

```js
module.exports = {
  preset: "jest-expo",
};
```

- [ ] **Step 3: Write the test**

```tsx
// apps/native/__tests__/smoke.test.tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

test("renders text content via React Native Testing Library", () => {
  render(<Text>Nova</Text>);
  expect(screen.getByText("Nova")).toBeTruthy();
});
```

- [ ] **Step 4: Add the `test` script**

In `apps/native/package.json`, add to `"scripts"`: `"test": "jest"`.

- [ ] **Step 5: Run it and verify it passes**

Run: `cd apps/native && bun run test`
Expected: PASS — 1 test.

- [ ] **Step 6: Verify it's picked up by the turbo task from Task 4**

Run: `bunx turbo run test --filter=native`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/native/jest.config.js apps/native/__tests__/smoke.test.tsx apps/native/package.json
git commit -m "test: add jest-expo to apps/native"
```

---

### Task 7: Maestro e2e for `apps/native` (Android)

**Files:**
- Modify: `apps/native/app.json` (add `expo.android.package`)
- Modify: `apps/native/.gitignore` (ignore generated native project folders)
- Create: `apps/native/.maestro/smoke.yaml`
- Modify: `apps/native/package.json` (add `test:e2e` script)
- Modify: `.github/workflows/ci.yml` (new `e2e-native` job)

**Interfaces:**
- Consumes: an installable Android build of the app. `apps/native/app.json` currently has no `android.package`, which `expo prebuild`/`expo run:android` requires for a proper native build — this task adds it.
- Produces: `maestro test .maestro/smoke.yaml` (documented via `bun run test:e2e`) drives a real emulator/device through app launch.

**Context for implementer:** this flow intentionally does nothing beyond `launchApp` — Plan A's job is proving the tool is wired up, not writing coverage for the current demo home screen (`app/(drawer)/index.tsx`), which a separate, already-approved finance-section design (`docs/superpowers/specs/2026-07-29-finance-section-mobile-home-login-design.md`) is about to replace. A flow asserting specific text on that screen would break the moment that feature ships. Extend this flow with real assertions once the Login/Home screens from that spec exist.

- [ ] **Step 1: Set the Android package name**

In `apps/native/app.json`, add `"android": { "package": "com.nova.app" }` inside the `"expo"` object.

- [ ] **Step 2: Ignore generated native project folders**

In `apps/native/.gitignore`, add:

```
/android
/ios
```

- [ ] **Step 3: Install the Maestro CLI locally**

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

(Adds `maestro` to `~/.maestro/bin`. This is a one-time local/CI machine setup, not a project dependency — nothing to commit for this step.)

- [ ] **Step 4: Write the smoke flow**

```yaml
# apps/native/.maestro/smoke.yaml
appId: com.nova.app
---
- launchApp
```

- [ ] **Step 5: Add the `test:e2e` script**

In `apps/native/package.json`, add to `"scripts"`: `"test:e2e": "maestro test .maestro/smoke.yaml"`.

- [ ] **Step 6: Run it locally against an emulator/device and verify it passes**

Run: `cd apps/native && bunx expo prebuild --platform android --non-interactive && bunx expo run:android`, then once installed: `bun run test:e2e`
Expected: Maestro reports the flow PASSED (app launched without crashing).

- [ ] **Step 7: Add the `e2e-native` CI job**

In `.github/workflows/ci.yml`, add another top-level job. This is the heaviest job in CI (Android emulator boot + Gradle build typically takes several minutes) — worth knowing before enabling branch-protection on it.

```yaml
  e2e-native:
    name: E2E (native, Android)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Install Maestro CLI
        run: curl -Ls "https://get.maestro.mobile.dev" | bash

      - name: Prebuild Android project
        run: bunx expo prebuild --platform android --non-interactive
        working-directory: apps/native

      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          target: google_apis
          arch: x86_64
          script: |
            cd apps/native/android
            ./gradlew assembleDebug
            adb install -r app/build/outputs/apk/debug/app-debug.apk
            adb shell am start -n com.nova.app/.MainActivity
            $HOME/.maestro/bin/maestro test ../.maestro/smoke.yaml
```

- [ ] **Step 8: Commit**

```bash
git add apps/native/app.json apps/native/.gitignore apps/native/.maestro/smoke.yaml apps/native/package.json .github/workflows/ci.yml
git commit -m "test: add maestro e2e to apps/native"
```

---

### Task 8: Ignore e2e tool output

**Files:**
- Modify: `.gitignore` (root)

**Interfaces:**
- Consumes: nothing.
- Produces: Playwright's local HTML report and Maestro's local run artifacts stay untracked, matching the existing `coverage`/`.nyc_output` entries under "# Testing".

- [ ] **Step 1: Add the entries**

In root `.gitignore`, under the existing `# Testing` section, add:

```
playwright-report
test-results
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore e2e test output directories"
```

---

## Self-Review Notes

- **Spec coverage:** all four tools (Vitest, Playwright, jest-expo/RTL, Maestro) have a task; all three Vitest workspaces (`packages/db`, `packages/api`, `apps/web`) are covered; turbo + CI wiring covered for unit tests (Task 4) and both e2e tools (Tasks 5 & 7).
- **Known limitation, stated explicitly rather than hidden:** the `apps/native` unit test (Task 6) deliberately avoids testing any existing component, because `uniwind`/`heroui-native`'s Jest-mocking behavior isn't confirmed in current docs — testing them for real happens once Plan B (finance screens) builds something that needs it.
- **Sequencing:** this plan should land and merge before the finance Home/Login implementation plan, per the earlier discussion with the user — that plan will write its tests against the infrastructure this one delivers.
