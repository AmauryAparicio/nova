import { sql } from "drizzle-orm";
import { pgEnum, pgTable } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const accountTypeEnum = pgEnum("account_type", [
  "debit",
  "cash",
  "investment",
  "cc",
  "savings",
  "loan",
  "vouchers",
  "other",
]);

export const financialAccount = pgTable("financial_account", (t) => ({
  accountType: accountTypeEnum("account_type").notNull().default("cash"),

  createdAt: t
    .timestamp("created_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow(),
  creditLimit: t
    .numeric("credit_limit", { precision: 15, scale: 2 })
    .default("0.00"),
  currency: t.text().notNull().default("MXN"),
  deletedAt: t.timestamp("deleted_at", { mode: "string", withTimezone: true }),
  description: t.text(),
  iconName: t.text("icon_name").notNull().default("CreditCard"),
  id: t.uuid().primaryKey().defaultRandom(),
  initialAmount: t
    .numeric("initial_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0.00"),
  isActive: t.boolean("is_active").notNull().default(true),

  // Flag to mark accounts as expense accounts (like credit cards)
  // When true, transfers TO this account are debt payments, not expenses
  // When true, expenses FROM this account don't count toward net expenses
  isExpenseAccount: t.boolean("is_expense_account").notNull().default(false),
  name: t.text().notNull(),

  sortOrder: t.integer("sort_order").notNull().default(0),
  updatedAt: t
    .timestamp("updated_at", { mode: "string", withTimezone: true })
    .notNull()
    .$onUpdate(() => sql`NOW()`),

  userId: t
    .uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}));

export type FinancialAccount = typeof financialAccount.$inferSelect;
export type NewFinancialAccount = typeof financialAccount.$inferInsert;
