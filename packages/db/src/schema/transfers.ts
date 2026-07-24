import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { EMBEDDING_DIMENSIONS } from "./constants";
import { financialAccount } from "./financial-accounts";

export const transfer = pgTable(
  "transfer",
  (t) => ({
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
    embedding: t.vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),

    fromAccountId: t
      .uuid("from_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "restrict" }),
    id: t.uuid().primaryKey().defaultRandom(),

    isExpense: t.boolean("is_expense").notNull().default(false),
    notes: t.text(),

    // RAG columns — semantic search over transfers
    semanticText: t.text("semantic_text"),
    toAccountId: t
      .uuid("to_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "restrict" }),

    transferDate: t
      .timestamp("transfer_date", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
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
    index("transfer_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export type Transfer = typeof transfer.$inferSelect;
export type NewTransfer = typeof transfer.$inferInsert;
