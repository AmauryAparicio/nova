import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { EMBEDDING_DIMENSIONS } from "./constants";
import { financialAccount } from "./financial-accounts";

// Expense Categories table — normalized, no RAG columns, to keep
// financial aggregations exact.
export const expenseCategory = pgTable("expense_category", (t) => ({
  color: t.text().notNull().default("blue"),

  createdAt: t
    .timestamp("created_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: t.timestamp("deleted_at", { mode: "string", withTimezone: true }),
  description: t.text(),
  iconName: t.text("icon_name").default("Tag"),
  id: t.uuid().primaryKey().defaultRandom(),
  name: t.text().notNull().unique(),
  updatedAt: t
    .timestamp("updated_at", { mode: "string", withTimezone: true })
    .notNull()
    .$onUpdate(() => sql`NOW()`),

  userId: t
    .uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}));

// Expenses table
export const expense = pgTable(
  "expense",
  (t) => ({
    accountId: t
      .uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "restrict" }),

    // Converted amount in account currency
    amount: t.numeric({ precision: 15, scale: 2 }).notNull(),

    createdAt: t
      .timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
    currency: t.text().notNull().default("MXN"),
    deletedAt: t.timestamp("deleted_at", {
      mode: "string",
      withTimezone: true,
    }),
    description: t.text(),
    embedding: t.vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),

    // Exchange rate used for conversion (originalAmount * exchangeRate = amount)
    exchangeRate: t
      .numeric("exchange_rate", { precision: 15, scale: 8 })
      .notNull()
      .default("1.00000000"),

    expenseDate: t
      .timestamp("expense_date", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
    id: t.uuid().primaryKey().defaultRandom(),

    // Deferred payment fields
    isDeferred: t.boolean("is_deferred").notNull().default(false),

    // Original transaction amount and currency
    originalCurrency: t.text("original_currency").notNull(),

    // RAG columns — semantic search over expenses
    semanticText: t.text("semantic_text"),
    title: t.text().notNull(),
    totalInstallments: t.integer("total_installments"),
    updatedAt: t
      .timestamp("updated_at", { mode: "string", withTimezone: true })
      .notNull()
      .$onUpdate(() => sql`NOW()`),

    userId: t
      .uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  }),
  (table) => [
    index("expense_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

// Many-to-many relationship between expenses and categories
export const expenseCategoryRelation = pgTable(
  "expense_category_relation",
  (t) => ({
    categoryId: t
      .uuid("category_id")
      .notNull()
      .references(() => expenseCategory.id, { onDelete: "cascade" }),

    createdAt: t
      .timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),

    expenseId: t
      .uuid("expense_id")
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    id: t.uuid().primaryKey().defaultRandom(),

    isPrimary: t.boolean("is_primary").notNull().default(false),
  })
);

// Expense Installments table (for deferred/monthly payments)
export const expenseInstallment = pgTable("expense_installment", (t) => ({
  amount: t.numeric({ precision: 15, scale: 2 }).notNull(),

  createdAt: t
    .timestamp("created_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow(),
  currency: t.text().notNull(),

  expenseId: t
    .uuid("expense_id")
    .notNull()
    .references(() => expense.id, { onDelete: "cascade" }),
  id: t.uuid().primaryKey().defaultRandom(),

  installmentNumber: t.integer("installment_number").notNull(),

  isPaid: t.boolean("is_paid").notNull().default(false),
  paidDate: t.timestamp("paid_date", { mode: "string", withTimezone: true }),
  updatedAt: t
    .timestamp("updated_at", { mode: "string", withTimezone: true })
    .notNull()
    .$onUpdate(() => sql`NOW()`),

  userId: t
    .uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}));

// Reimbursements table
export const reimbursement = pgTable("reimbursement", (t) => ({
  accountId: t
    .uuid("account_id")
    .notNull()
    .references(() => financialAccount.id, { onDelete: "restrict" }),

  amount: t.numeric({ precision: 15, scale: 2 }).notNull(),

  createdAt: t
    .timestamp("created_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow(),
  currency: t.text().notNull().default("MXN"),
  deletedAt: t.timestamp("deleted_at", { mode: "string", withTimezone: true }),

  description: t.text(),

  exchangeRate: t
    .numeric("exchange_rate", { precision: 15, scale: 8 })
    .notNull()
    .default("1.00000000"),

  expenseId: t
    .uuid("expense_id")
    .notNull()
    .references(() => expense.id, { onDelete: "cascade" }),
  id: t.uuid().primaryKey().defaultRandom(),

  originalCurrency: t.text("original_currency").notNull(),

  reimbursementDate: t.timestamp("reimbursement_date", {
    mode: "string",
    withTimezone: true,
  }),
  updatedAt: t
    .timestamp("updated_at", { mode: "string", withTimezone: true })
    .notNull()
    .$onUpdate(() => sql`NOW()`),

  userId: t
    .uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}));

export type ExpenseCategory = typeof expenseCategory.$inferSelect;
export type NewExpenseCategory = typeof expenseCategory.$inferInsert;

export type Expense = typeof expense.$inferSelect;
export type NewExpense = typeof expense.$inferInsert;

export type ExpenseCategoryRelation =
  typeof expenseCategoryRelation.$inferSelect;
export type NewExpenseCategoryRelation =
  typeof expenseCategoryRelation.$inferInsert;

export type ExpenseInstallment = typeof expenseInstallment.$inferSelect;
export type NewExpenseInstallment = typeof expenseInstallment.$inferInsert;

export type Reimbursement = typeof reimbursement.$inferSelect;
export type NewReimbursement = typeof reimbursement.$inferInsert;
