import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { EMBEDDING_DIMENSIONS } from "./constants";
import { financialAccount } from "./financial-accounts";

// Income Categories table — normalized, no RAG columns, to keep
// financial aggregations exact.
export const incomeCategory = pgTable("income_category", (t) => ({
  color: t.text().notNull().default("blue"),

  createdAt: t
    .timestamp("created_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: t.timestamp("deleted_at", { mode: "string", withTimezone: true }),
  description: t.text(),
  iconName: t.text("icon_name").default("DollarSign"),
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

// Income table
export const income = pgTable(
  "income",
  (t) => ({
    accountId: t
      .uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "restrict" }),

    // Converted amount in account currency
    amount: t.numeric({ precision: 15, scale: 2 }).notNull(),

    categoryId: t
      .uuid("category_id")
      .references(() => incomeCategory.id, { onDelete: "set null" }),

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
    id: t.uuid().primaryKey().defaultRandom(),

    incomeDate: t
      .timestamp("income_date", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),

    // Original transaction amount and currency
    originalCurrency: t.text("original_currency").notNull(),

    // RAG columns — semantic search over income
    semanticText: t.text("semantic_text"),
    title: t.text().notNull(),
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
    index("income_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export type IncomeCategory = typeof incomeCategory.$inferSelect;
export type NewIncomeCategory = typeof incomeCategory.$inferInsert;

export type Income = typeof income.$inferSelect;
export type NewIncome = typeof income.$inferInsert;
