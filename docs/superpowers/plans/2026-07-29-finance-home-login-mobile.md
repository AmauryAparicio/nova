# Finance Home & Login (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two approved mobile screens — a dedicated Login screen and a Home hub with a Finance module (balance + recent activity) — behind a session + biometric guard, backed by one new `finance.getHomeSummary` endpoint.

**Architecture:** `app/login.tsx` (unauthenticated, outside the drawer) and a new `app/(protected)/` route group wrap the existing `(drawer)` content; `(protected)/_layout.tsx` redirects to `/login` with no session, then gates on `useBiometricLock()` before rendering the drawer. The Home hub calls one protected tRPC procedure that runs two UNION ALL queries in `packages/db` (recent activity across expense/income/transfer; balance parts across accounts/income/expense/transfer) and formats everything server-side before it reaches the client. Depends on the Vitest/Playwright/jest-expo/Maestro infrastructure from `docs/superpowers/plans/2026-07-29-test-infrastructure-setup.md` — **that plan must land first.**

**Tech Stack:** expo-router route groups, `expo-local-authentication`, Drizzle ORM `unionAll()`, tRPC `protectedProcedure`, heroui-native.

## Global Constraints

- No `let`, no `any`, `const` by default, guard clauses over `else`.
- All server-side data (currency, dates, formatted strings) is computed server-side — the client renders display-ready strings only (thin-client rule).
- All new npm dependencies must be pre-approved: this plan adds exactly one, `expo-local-authentication`, already approved during design.
- Single-user app: only `ALLOWED_SIGNUP_EMAIL` can ever sign in — untouched by this plan.
- Write operations must use `db.transaction()` — not applicable here, every query in this plan is read-only.
- Explicit field selection only, no `select *`.

**Known, deliberately-scoped testing gap:** every existing `apps/native` component (`Container`, `ThemeToggle`) and every `heroui-native` primitive is coupled to `uniwind`'s runtime, whose Jest-mocking behavior isn't confirmed in current docs (see Task 6 of the test-infra plan). Rather than guess, this plan does **not** attempt jest-expo render tests for `login.tsx`, `(protected)/_layout.tsx`, the lock screen, or the Home screen — those are verified manually and via one real Maestro e2e flow (Task 10). Everything that can be tested without rendering styled native UI — the DB query shape, the formatting helpers, the router's own logic, the biometric-lock *hook* (no JSX) — is tested for real with Vitest/jest-expo.

---

### Task 1: Add `expo-local-authentication`

**Files:**
- Modify: `apps/native/package.json`
- Modify: `apps/native/app.json`

**Interfaces:**
- Produces: `hasHardwareAsync`, `isEnrolledAsync`, `authenticateAsync` importable from `expo-local-authentication`, used by Task 5.

- [ ] **Step 1: Add the dependency**

```bash
cd apps/native && bunx expo install expo-local-authentication && cd ../..
```

(`expo install` picks the version matching this project's Expo SDK — the correct way to add Expo SDK packages, rather than a bare `bun add`.)

- [ ] **Step 2: Register the config plugin**

In `apps/native/app.json`, add to the `"plugins"` array (currently `["expo-font"]`):

```json
    "plugins": [
      "expo-font",
      [
        "expo-local-authentication",
        {
          "faceIDPermission": "Allow Nova to use Face ID to unlock the app."
        }
      ]
    ],
```

- [ ] **Step 3: Commit**

```bash
git add apps/native/package.json apps/native/app.json
git commit -m "chore: add expo-local-authentication"
```

---

### Task 2: Finance summary query module (`packages/db`)

**Files:**
- Create: `packages/db/src/queries/finance/get-home-summary.ts`
- Create: `packages/db/src/queries/finance/get-home-summary.test.ts`

**Interfaces:**
- Consumes: `expense`, `income`, `transfer`, `financialAccount` table exports (all already exist).
- Produces:
  - `const RECENT_ACTIVITY_LIMIT = 5`
  - `type ActivityKind = "expense" | "income" | "transfer"`
  - `type RecentActivityRow = { id: string; kind: ActivityKind; title: string; occurredAt: string; amount: string; currency: string }`
  - `type HomeSummary = { totalBalance: number; currency: string; recentActivity: RecentActivityRow[] }`
  - `function buildRecentActivityQuery(qb: QueryBuilder, userId: string)` — pure, test-only.
  - `function buildBalancePartsQuery(qb: QueryBuilder, userId: string)` — pure, test-only.
  - `async function getHomeSummary(db: NodePgDatabase, userId: string): Promise<HomeSummary>` — Task 4 imports this.

**Context for implementer:** the balance is `initialAmount` of every active MXN account, plus income, minus expenses, plus transfers-in, minus transfers-out, across those accounts. A single query joining income+expense+transfer to `financialAccount` would multiply rows across the three joins (a fan-out bug producing wrong sums) — so it's five independent `UNION ALL` branches instead, each an independently-scoped scalar sum, added together in JS. This is the same reason the recent-activity feed is a `UNION ALL`: it lets each source table stay independently, correctly scoped while still costing one round trip. Multi-currency accounts are excluded (`currency = 'MXN'`), matching the approved spec's stated MVP simplification.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/db/src/queries/finance/get-home-summary.test.ts
import { QueryBuilder } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";

import { buildBalancePartsQuery, buildRecentActivityQuery } from "./get-home-summary";

const USER_ID = "11111111-1111-1111-1111-111111111111";

it("builds a recent-activity query that unions expense, income, and transfer", () => {
  const { sql } = buildRecentActivityQuery(new QueryBuilder(), USER_ID).toSQL();

  expect(sql).toContain("from \"expense\"");
  expect(sql).toContain("from \"income\"");
  expect(sql).toContain("from \"transfer\"");
  expect(sql).toContain("union all");
  expect(sql).toContain("limit");
});

it("builds a balance-parts query with five union branches scoped to MXN accounts", () => {
  const { sql, params } = buildBalancePartsQuery(new QueryBuilder(), USER_ID).toSQL();

  expect(sql.match(/union all/g)).toHaveLength(4);
  expect(sql).toContain("'MXN'");
  expect(params).toContain(USER_ID);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd packages/db && bun run test`
Expected: FAIL — `get-home-summary.ts` doesn't exist yet.

- [ ] **Step 3: Write the query module**

```ts
// packages/db/src/queries/finance/get-home-summary.ts
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { QueryBuilder } from "drizzle-orm/pg-core";

import { expense } from "../../schema/expenses";
import { financialAccount } from "../../schema/financial-accounts";
import { income } from "../../schema/income";
import { transfer } from "../../schema/transfers";

export const RECENT_ACTIVITY_LIMIT = 5;
const DEFAULT_CURRENCY = "MXN";

export type ActivityKind = "expense" | "income" | "transfer";

export type RecentActivityRow = {
  amount: string;
  currency: string;
  id: string;
  kind: ActivityKind;
  occurredAt: string;
  title: string;
};

export type HomeSummary = {
  currency: string;
  recentActivity: RecentActivityRow[];
  totalBalance: number;
};

export function buildRecentActivityQuery(qb: QueryBuilder, userId: string) {
  const expenseRows = qb
    .select({
      amount: expense.amount,
      currency: expense.currency,
      id: expense.id,
      kind: sql<ActivityKind>`'expense'`.as("kind"),
      occurredAt: expense.expenseDate,
      title: expense.title,
    })
    .from(expense)
    .where(and(eq(expense.userId, userId), isNull(expense.deletedAt)));

  const incomeRows = qb
    .select({
      amount: income.amount,
      currency: income.currency,
      id: income.id,
      kind: sql<ActivityKind>`'income'`.as("kind"),
      occurredAt: income.incomeDate,
      title: income.title,
    })
    .from(income)
    .where(and(eq(income.userId, userId), isNull(income.deletedAt)));

  const transferRows = qb
    .select({
      amount: transfer.amount,
      currency: transfer.currency,
      id: transfer.id,
      kind: sql<ActivityKind>`'transfer'`.as("kind"),
      occurredAt: transfer.transferDate,
      title: sql<string>`coalesce(${transfer.notes}, 'Transfer')`.as("title"),
    })
    .from(transfer)
    .where(and(eq(transfer.userId, userId), isNull(transfer.deletedAt)));

  return expenseRows
    .unionAll(incomeRows)
    .unionAll(transferRows)
    .orderBy(sql`occurred_at desc`)
    .limit(RECENT_ACTIVITY_LIMIT);
}

function activeMxnAccountIds(qb: QueryBuilder, userId: string) {
  return qb
    .select({ id: financialAccount.id })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.userId, userId),
        eq(financialAccount.isActive, true),
        eq(financialAccount.currency, DEFAULT_CURRENCY)
      )
    );
}

export function buildBalancePartsQuery(qb: QueryBuilder, userId: string) {
  const accountIds = activeMxnAccountIds(qb, userId);

  const initialAmounts = qb
    .select({
      amount: sql<string>`coalesce(sum(${financialAccount.initialAmount}), 0)`,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.userId, userId),
        eq(financialAccount.isActive, true),
        eq(financialAccount.currency, DEFAULT_CURRENCY)
      )
    );

  const incomeTotal = qb
    .select({ amount: sql<string>`coalesce(sum(${income.amount}), 0)` })
    .from(income)
    .where(and(sql`${income.accountId} in ${accountIds}`, isNull(income.deletedAt)));

  const expenseTotal = qb
    .select({ amount: sql<string>`coalesce(-sum(${expense.amount}), 0)` })
    .from(expense)
    .where(and(sql`${expense.accountId} in ${accountIds}`, isNull(expense.deletedAt)));

  const transfersIn = qb
    .select({ amount: sql<string>`coalesce(sum(${transfer.amount}), 0)` })
    .from(transfer)
    .where(
      and(sql`${transfer.toAccountId} in ${accountIds}`, isNull(transfer.deletedAt))
    );

  const transfersOut = qb
    .select({ amount: sql<string>`coalesce(-sum(${transfer.amount}), 0)` })
    .from(transfer)
    .where(
      and(sql`${transfer.fromAccountId} in ${accountIds}`, isNull(transfer.deletedAt))
    );

  return initialAmounts
    .unionAll(incomeTotal)
    .unionAll(expenseTotal)
    .unionAll(transfersIn)
    .unionAll(transfersOut);
}

export async function getHomeSummary(
  db: NodePgDatabase,
  userId: string
): Promise<HomeSummary> {
  const qb = new QueryBuilder();

  const [balanceParts, recentActivity] = await Promise.all([
    db.execute(buildBalancePartsQuery(qb, userId).toSQL().sql),
    buildRecentActivityQuery(qb, userId),
  ]);

  const totalBalance = (balanceParts.rows as { amount: string }[]).reduce(
    (total, row) => total + Number(row.amount),
    0
  );

  return {
    currency: DEFAULT_CURRENCY,
    recentActivity: recentActivity as RecentActivityRow[],
    totalBalance,
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd packages/db && bun run test`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/finance
git commit -m "feat: add finance home-summary query module"
```

---

### Task 3: Finance formatting helpers (`packages/api`)

**Files:**
- Create: `packages/api/src/lib/finance-formatting.ts`
- Create: `packages/api/src/lib/finance-formatting.test.ts`

**Interfaces:**
- Consumes: `ActivityKind`, `RecentActivityRow` types from `@nova/db/queries/finance/get-home-summary` (Task 2).
- Produces: `formatCurrency(amount: number, currency: string): string`, `formatRelativeDate(isoDate: string, now?: Date): string`, `formatActivityAmount(row: Pick<RecentActivityRow, "kind" | "amount" | "currency">): string` — Task 4 imports all three.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/src/lib/finance-formatting.test.ts
import { expect, it } from "vitest";

import {
  formatActivityAmount,
  formatCurrency,
  formatRelativeDate,
} from "./finance-formatting";

it("formats a currency amount for MXN", () => {
  expect(formatCurrency(42_350, "MXN")).toBe("$42,350.00");
});

it("labels same-day and previous-day dates", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");
  expect(formatRelativeDate("2026-07-29T08:00:00.000Z", now)).toBe("Today");
  expect(formatRelativeDate("2026-07-28T23:00:00.000Z", now)).toBe("Yesterday");
});

it("prefixes expense amounts with a minus sign and income with a plus sign", () => {
  expect(
    formatActivityAmount({ amount: "450.00", currency: "MXN", kind: "expense" })
  ).toBe("-$450.00");
  expect(
    formatActivityAmount({ amount: "15000.00", currency: "MXN", kind: "income" })
  ).toBe("+$15,000.00");
  expect(
    formatActivityAmount({ amount: "1200.00", currency: "MXN", kind: "transfer" })
  ).toBe("$1,200.00");
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd packages/api && bun run test`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the helpers**

```ts
// packages/api/src/lib/finance-formatting.ts
import type { ActivityKind, RecentActivityRow } from "@nova/db/queries/finance/get-home-summary";

const LOCALE = "es-MX";
const MS_PER_DAY = 86_400_000;

const AMOUNT_PREFIX: Record<ActivityKind, string> = {
  expense: "-",
  income: "+",
  transfer: "",
};

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { currency, style: "currency" }).format(
    amount
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatRelativeDate(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / MS_PER_DAY
  );

  if (dayDiff === 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Yesterday";
  }
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(
    date
  );
}

export function formatActivityAmount(
  row: Pick<RecentActivityRow, "amount" | "currency" | "kind">
): string {
  return `${AMOUNT_PREFIX[row.kind]}${formatCurrency(Number(row.amount), row.currency)}`;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd packages/api && bun run test`
Expected: PASS — 3 tests green. (If `Intl.NumberFormat`'s exact output differs slightly by Node/Bun ICU build — e.g. spacing — adjust the expected strings to match actual output; the formatting behavior is what matters, not the literal string.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/finance-formatting.ts packages/api/src/lib/finance-formatting.test.ts
git commit -m "feat: add finance formatting helpers"
```

---

### Task 4: Finance router (`packages/api`)

**Files:**
- Create: `packages/api/src/routers/finance.ts`
- Create: `packages/api/src/routers/finance.test.ts`
- Modify: `packages/api/src/routers/index.ts` (register `finance: financeRouter`)

**Interfaces:**
- Consumes: `getHomeSummary` (Task 2), `formatCurrency`/`formatRelativeDate`/`formatActivityAmount` (Task 3), `protectedProcedure`/`router` from `../index`, `db` from `@nova/db`.
- Produces: `appRouter.finance.getHomeSummary` — a protected query returning `{ totalBalance: string; recentActivity: { id: string; title: string; formattedAmount: string; formattedDate: string; kind: ActivityKind }[] }`. Task 9 (native Home screen) consumes this shape via `trpc.finance.getHomeSummary.queryOptions()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/routers/finance.test.ts
import { expect, it, vi } from "vitest";

vi.mock("@nova/db/queries/finance/get-home-summary", () => ({
  getHomeSummary: vi.fn().mockResolvedValue({
    currency: "MXN",
    recentActivity: [
      {
        amount: "450.00",
        currency: "MXN",
        id: "expense-1",
        kind: "expense",
        occurredAt: "2026-07-29T08:00:00.000Z",
        title: "Groceries",
      },
    ],
    totalBalance: 42_350,
  }),
}));

const { appRouter } = await import("./index");
const { Context } = await import("../context");

it("formats the home summary through a protected caller", async () => {
  const session = {
    user: { id: "user-1" },
  } as unknown as NonNullable<InstanceType<typeof Context>["session"]>;

  const caller = appRouter.createCaller({ auth: null, session });
  const result = await caller.finance.getHomeSummary();

  expect(result.totalBalance).toBe("$42,350.00");
  expect(result.recentActivity).toHaveLength(1);
  expect(result.recentActivity[0].formattedAmount).toBe("-$450.00");
});

it("rejects an unauthenticated caller", async () => {
  const caller = appRouter.createCaller({ auth: null, session: null });
  await expect(caller.finance.getHomeSummary()).rejects.toThrow(
    "Authentication required"
  );
});
```

**Note for implementer:** `Context` is a type, not a class — `InstanceType<typeof Context>` in the snippet above won't work as written since `Context` (from `packages/api/src/context.ts`) is exported via `export type Context = Awaited<ReturnType<typeof createContext>>`, not a class. Use `NonNullable<Context["session"]>` directly (import `type { Context } from "../context"`) instead of the `InstanceType`/`await import` dance shown — fix this during Step 1 before running anything; the corrected import line is:

```ts
import type { Context } from "../context";
```

and the cast becomes `{ user: { id: "user-1" } } as unknown as NonNullable<Context["session"]>`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd packages/api && bun run test`
Expected: FAIL — `finance.ts` router doesn't exist, `appRouter.finance` is undefined.

- [ ] **Step 3: Write the router**

```ts
// packages/api/src/routers/finance.ts
import { getHomeSummary } from "@nova/db/queries/finance/get-home-summary";
import { db } from "@nova/db";

import { protectedProcedure, router } from "../index";
import {
  formatActivityAmount,
  formatCurrency,
  formatRelativeDate,
} from "../lib/finance-formatting";

export const financeRouter = router({
  getHomeSummary: protectedProcedure.query(async ({ ctx }) => {
    const summary = await getHomeSummary(db, ctx.session.user.id);

    return {
      recentActivity: summary.recentActivity.map((row) => ({
        formattedAmount: formatActivityAmount(row),
        formattedDate: formatRelativeDate(row.occurredAt),
        id: row.id,
        kind: row.kind,
        title: row.title,
      })),
      totalBalance: formatCurrency(summary.totalBalance, summary.currency),
    };
  }),
});
```

- [ ] **Step 4: Register the router**

In `packages/api/src/routers/index.ts`:

```ts
import { protectedProcedure, publicProcedure, router } from "../index";
import { financeRouter } from "./finance";
import { todoRouter } from "./todo";

export const appRouter = router({
  finance: financeRouter,
  healthCheck: publicProcedure.query(() => "OK"),
  privateData: protectedProcedure.query(({ ctx }) => ({
    message: "This is private",
    user: ctx.session.user,
  })),
  todo: todoRouter,
});
export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd packages/api && bun run test`
Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/finance.ts packages/api/src/routers/finance.test.ts packages/api/src/routers/index.ts
git commit -m "feat: add finance.getHomeSummary router"
```

---

### Task 5: `useBiometricLock` hook (`apps/native`)

**Files:**
- Create: `apps/native/hooks/use-biometric-lock.ts`
- Create: `apps/native/hooks/use-biometric-lock.test.ts`

**Interfaces:**
- Consumes: `hasHardwareAsync`, `isEnrolledAsync`, `authenticateAsync` from `expo-local-authentication` (Task 1).
- Produces: `useBiometricLock(): { locked: boolean; retry: () => void }` — Task 8 (`(protected)/_layout.tsx`) consumes this.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/native/hooks/use-biometric-lock.test.ts
import { renderHook, waitFor } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";

import { useBiometricLock } from "./use-biometric-lock";

test("skips the lock when no biometrics are enrolled", async () => {
  jest.spyOn(LocalAuthentication, "hasHardwareAsync").mockResolvedValue(true);
  jest.spyOn(LocalAuthentication, "isEnrolledAsync").mockResolvedValue(false);

  const { result } = renderHook(() => useBiometricLock());

  await waitFor(() => expect(result.current.locked).toBe(false));
});

test("stays locked until authenticateAsync succeeds", async () => {
  jest.spyOn(LocalAuthentication, "hasHardwareAsync").mockResolvedValue(true);
  jest.spyOn(LocalAuthentication, "isEnrolledAsync").mockResolvedValue(true);
  jest
    .spyOn(LocalAuthentication, "authenticateAsync")
    .mockResolvedValue({ success: true });

  const { result } = renderHook(() => useBiometricLock());

  await waitFor(() => expect(result.current.locked).toBe(false));
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/native && bun run test`
Expected: FAIL — `use-biometric-lock.ts` doesn't exist.

- [ ] **Step 3: Write the hook**

```ts
// apps/native/hooks/use-biometric-lock.ts
import {
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync,
} from "expo-local-authentication";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

async function shouldLock(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    hasHardwareAsync(),
    isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export function useBiometricLock() {
  const [locked, setLocked] = useState(true);

  const attemptUnlock = useCallback(async () => {
    const lockRequired = await shouldLock();
    if (!lockRequired) {
      setLocked(false);
      return;
    }
    const result = await authenticateAsync({
      disableDeviceFallback: false,
      promptMessage: "Unlock Nova",
    });
    setLocked(!result.success);
  }, []);

  useEffect(() => {
    attemptUnlock();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        attemptUnlock();
      }
    });
    return () => subscription.remove();
  }, [attemptUnlock]);

  return { locked, retry: attemptUnlock };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/native && bun run test`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/native/hooks/use-biometric-lock.ts apps/native/hooks/use-biometric-lock.test.ts
git commit -m "feat: add useBiometricLock hook"
```

---

### Task 6: Biometric lock screen (`apps/native`)

**Files:**
- Create: `apps/native/components/biometric-lock-screen.tsx`

**Interfaces:**
- Consumes: nothing beyond a `{ onRetry: () => void }` prop.
- Produces: `BiometricLockScreen` component — Task 8 renders this.

No automated test for this file — see the Global Constraints note on `heroui-native`/`uniwind` render-testing. Verified manually and via Task 10's Maestro flow.

- [ ] **Step 1: Write the component**

```tsx
// apps/native/components/biometric-lock-screen.tsx
import { Button } from "heroui-native";
import { Text, View } from "react-native";

export function BiometricLockScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="font-medium text-foreground text-lg">Nova is locked</Text>
      <Button onPress={onRetry}>
        <Button.Label>Unlock</Button.Label>
      </Button>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/components/biometric-lock-screen.tsx
git commit -m "feat: add biometric lock screen"
```

---

### Task 7: Login screen (`apps/native`)

**Files:**
- Create: `apps/native/app/login.tsx`

**Interfaces:**
- Consumes: `SignIn` (`apps/native/components/sign-in.tsx`), `SignUp` (`apps/native/components/sign-up.tsx`), `authClient` (`apps/native/lib/auth-client.ts`), `Container` (`apps/native/components/container.tsx`) — all already exist, unmodified.
- Produces: the `/login` route. Task 8's guard redirects here.

No automated test — see Global Constraints note.

- [ ] **Step 1: Write the screen**

```tsx
// apps/native/app/login.tsx
import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";

export default function LoginScreen() {
  const [showSignUp, setShowSignUp] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  const toggleMode = () => setShowSignUp((prev) => !prev);

  if (isPending) {
    return null;
  }

  if (session?.user) {
    return <Redirect href="/" />;
  }

  return (
    <Container className="justify-center p-6">
      <View className="mb-6">
        <Text className="font-bold text-3xl text-foreground">Nova</Text>
      </View>

      {showSignUp ? <SignUp /> : <SignIn />}

      <Pressable className="mt-4 self-center" onPress={toggleMode}>
        <Text className="text-muted text-sm">
          {showSignUp
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </Text>
      </Pressable>
    </Container>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/app/login.tsx
git commit -m "feat: add dedicated login screen"
```

---

### Task 8: `(protected)` route group — session + biometric guard

**Files:**
- Create: `apps/native/app/(protected)/_layout.tsx`
- Move: `apps/native/app/(drawer)/` → `apps/native/app/(protected)/(drawer)/` (all contents unchanged in this task — `_layout.tsx`, `todos.tsx`, `(tabs)/`; `index.tsx` is replaced in Task 9, not here)
- Modify: `apps/native/app/_layout.tsx`

**Interfaces:**
- Consumes: `useBiometricLock` (Task 5), `BiometricLockScreen` (Task 6), `authClient` from `@/lib/auth-client`.
- Produces: the `(protected)` route group — everything under it is unreachable without a session and a passed biometric check.

No automated test — see Global Constraints note. Verified manually and via Task 10.

- [ ] **Step 1: Move the drawer routes**

```bash
mkdir -p apps/native/app/\(protected\)
git mv apps/native/app/\(drawer\) apps/native/app/\(protected\)/\(drawer\)
```

- [ ] **Step 2: Write the guard layout**

```tsx
// apps/native/app/(protected)/_layout.tsx
import { Redirect, Stack } from "expo-router";

import { BiometricLockScreen } from "@/components/biometric-lock-screen";
import { useBiometricLock } from "@/hooks/use-biometric-lock";
import { authClient } from "@/lib/auth-client";

export default function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();
  const { locked, retry } = useBiometricLock();

  if (isPending) {
    return null;
  }

  if (!session?.user) {
    return <Redirect href="/login" />;
  }

  if (locked) {
    return <BiometricLockScreen onRetry={retry} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Update the root layout**

In `apps/native/app/_layout.tsx`, change:

```tsx
export const unstable_settings = {
  initialRouteName: "(drawer)",
};

function StackLayout() {
  return (
    <Stack screenOptions={{}}>
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}
```

to:

```tsx
export const unstable_settings = {
  initialRouteName: "(protected)",
};

function StackLayout() {
  return (
    <Stack screenOptions={{}}>
      <Stack.Screen name="(protected)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A apps/native/app
git commit -m "feat: gate the app behind session + biometric guard"
```

---

### Task 9: Home screen Finance module

**Files:**
- Modify: `apps/native/app/(protected)/(drawer)/index.tsx` (full rewrite — replaces the Better-T-Stack demo content, including the inline `<SignIn/>`/`<SignUp/>` forms now covered by Task 7's dedicated screen)

**Interfaces:**
- Consumes: `trpc.finance.getHomeSummary.queryOptions()` (Task 4's router, via the existing `trpc` proxy in `apps/native/utils/trpc.ts`).

No automated test — see Global Constraints note. Verified manually and via Task 10.

- [ ] **Step 1: Rewrite the screen**

```tsx
// apps/native/app/(protected)/(drawer)/index.tsx
import { useQuery } from "@tanstack/react-query";
import { Card, Surface } from "heroui-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { trpc } from "@/utils/trpc";

const AMOUNT_COLOR: Record<"expense" | "income" | "transfer", string> = {
  expense: "text-danger",
  income: "text-success",
  transfer: "text-muted",
};

export default function Home() {
  const summary = useQuery(trpc.finance.getHomeSummary.queryOptions());
  const recentActivity = summary.data?.recentActivity ?? [];

  return (
    <Container className="p-6">
      <Card className="mb-6 p-6" variant="secondary">
        <Card.Title>Total Balance</Card.Title>
        <Text className="mt-2 font-bold text-3xl text-foreground">
          {summary.data?.totalBalance ?? "—"}
        </Text>
      </Card>

      <Card className="p-4" variant="secondary">
        <Card.Title className="mb-3">Recent Activity</Card.Title>
        <View className="gap-2">
          {recentActivity.map((activity) => (
            <Surface
              className="rounded-lg p-3"
              key={activity.id}
              variant="secondary"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-foreground">{activity.title}</Text>
                  <Text className="text-muted text-xs">
                    {activity.formattedDate}
                  </Text>
                </View>
                <Text className={AMOUNT_COLOR[activity.kind]}>
                  {activity.formattedAmount}
                </Text>
              </View>
            </Surface>
          ))}
          {recentActivity.length === 0 && (
            <Text className="text-muted text-sm">No activity yet</Text>
          )}
        </View>
      </Card>
    </Container>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/app/\(protected\)/\(drawer\)/index.tsx
git commit -m "feat: replace demo home with finance module"
```

---

### Task 10: Extend the Maestro flow with real assertions

**Files:**
- Modify: `apps/native/.maestro/smoke.yaml` (created in the test-infra plan as a bare `launchApp`)

**Interfaces:**
- Consumes: the running app (Tasks 7–9) and a seeded test account matching `ALLOWED_SIGNUP_EMAIL`.

This is the one **real, automated, end-to-end** check covering everything Tasks 6–9 built that unit tests intentionally couldn't reach.

- [ ] **Step 1: Extend the flow**

```yaml
# apps/native/.maestro/smoke.yaml
appId: com.nova.app
---
- launchApp
- assertVisible: "Nova"
- assertVisible: "Sign In"
- tapOn:
    id: "email-input"
- inputText: ${TEST_USER_EMAIL}
- tapOn:
    id: "password-input"
- inputText: ${TEST_USER_PASSWORD}
- tapOn: "Sign In"
- assertVisible: "Total Balance"
```

**Note for implementer:** the `id: "email-input"` / `id: "password-input"` selectors require `testID` props on `apps/native/components/sign-in.tsx`'s email/password `Input` components (currently absent — add `testID="email-input"` / `testID="password-input"` to those two `Input` elements as part of this step; Maestro matches React Native's `testID` prop). `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` are Maestro env vars — pass them at run time (`maestro test -e TEST_USER_EMAIL=... -e TEST_USER_PASSWORD=... .maestro/smoke.yaml`), pointing at the single allowed test account. Never hardcode real credentials into the flow file.

- [ ] **Step 2: Add the `testID`s**

In `apps/native/components/sign-in.tsx`, add `testID="email-input"` to the email `Input` and `testID="password-input"` to the password `Input`.

- [ ] **Step 3: Run it locally against an emulator/device with the app installed**

Run: `cd apps/native && maestro test -e TEST_USER_EMAIL=<allowed email> -e TEST_USER_PASSWORD=<its password> .maestro/smoke.yaml`
Expected: Maestro reports the flow PASSED — launches into `/login`, signs in, lands on the Home hub, sees "Total Balance".

- [ ] **Step 4: Update the CI job**

In `.github/workflows/ci.yml`'s `e2e-native` job (added by the test-infra plan), add the two env vars (as repo secrets) to the Maestro run line:

```yaml
            $HOME/.maestro/bin/maestro test -e TEST_USER_EMAIL=${{ secrets.TEST_USER_EMAIL }} -e TEST_USER_PASSWORD=${{ secrets.TEST_USER_PASSWORD }} ../.maestro/smoke.yaml
```

This requires a seeded test user in whatever database the CI emulator's app build points at — out of scope for this plan (the app currently has no seed-data mechanism); until that exists, run this job manually/locally rather than blocking CI on it.

- [ ] **Step 5: Commit**

```bash
git add apps/native/.maestro/smoke.yaml apps/native/components/sign-in.tsx .github/workflows/ci.yml
git commit -m "test: extend maestro smoke flow through login and home"
```

---

## Self-Review Notes

- **Spec coverage:** dedicated Login screen ✓ (Task 7), whole-app session guard ✓ (Task 8), biometric lock with no-enrollment fallback ✓ (Task 5's `shouldLock`), Home as a hub with only the Finance module built ✓ (Task 9), server-side formatting ✓ (Task 3/4), single round-trip-minded queries ✓ (Task 2's two `UNION ALL`s instead of N+1 queries).
- **Sequencing dependency, stated plainly:** every `bun run test` step in this plan assumes `docs/superpowers/plans/2026-07-29-test-infrastructure-setup.md` has already been executed (Vitest scripts, jest-expo config, and `.maestro/smoke.yaml`'s existence all come from that plan). Do not start Task 1 until that plan is merged.
- **Type-check note carried into Task 4:** the test snippet's first draft used an `InstanceType`/dynamic-`import` pattern for the session fixture that doesn't actually work against `Context`'s real (type, not class) definition — the task's own note calls this out and gives the corrected line, so the implementer isn't left to discover it by trial and error.
