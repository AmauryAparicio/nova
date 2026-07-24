import { index, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable("user", (t) => ({
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  deletedAt: t.timestamp("deleted_at"),
  email: t.text().notNull().unique(),
  emailVerified: t.boolean("email_verified").default(false).notNull(),
  id: t.uuid().primaryKey(),
  image: t.text(),
  name: t.text().notNull(),
  updatedAt: t
    .timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}));

export const session = pgTable(
  "session",
  (t) => ({
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    deletedAt: t.timestamp("deleted_at"),
    expiresAt: t.timestamp("expires_at").notNull(),
    id: t.uuid().primaryKey(),
    ipAddress: t.text("ip_address"),
    token: t.text().notNull().unique(),
    updatedAt: t
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userAgent: t.text("user_agent"),
    userId: t
      .uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  }),
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  (t) => ({
    accessToken: t.text("access_token"),
    accessTokenExpiresAt: t.timestamp("access_token_expires_at"),
    accountId: t.text("account_id").notNull(),
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    deletedAt: t.timestamp("deleted_at"),
    id: t.uuid().primaryKey(),
    idToken: t.text("id_token"),
    password: t.text(),
    providerId: t.text("provider_id").notNull(),
    refreshToken: t.text("refresh_token"),
    refreshTokenExpiresAt: t.timestamp("refresh_token_expires_at"),
    scope: t.text(),
    updatedAt: t
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userId: t
      .uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  }),
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  (t) => ({
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    deletedAt: t.timestamp("deleted_at"),
    expiresAt: t.timestamp("expires_at").notNull(),
    id: t.uuid().primaryKey(),
    identifier: t.text().notNull(),
    updatedAt: t
      .timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    value: t.text().notNull(),
  }),
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const apikey = pgTable(
  "apikey",
  (t) => ({
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    // better-auth's own apikey schema has no deletedAt; added here for
    // consistency with the soft-delete convention on every other auth table.
    deletedAt: t.timestamp("deleted_at"),
    enabled: t.boolean().notNull().default(true),
    expiresAt: t.date("expires_at"),
    id: t.uuid().primaryKey(),
    key: t.text().notNull(),
    lastRefillAt: t.date("last_refill_at"),
    lastRequest: t.timestamp("last_request"),
    metadata: t.jsonb(),
    name: t.text(),
    permissions: t.text(),
    prefix: t.text(),
    rateLimitEnabled: t.boolean("rate_limit_enabled").notNull().default(false),
    rateLimitMax: t.integer("rate_limit_max"),
    rateLimitTimeWindow: t.integer("rate_limit_time_window"),
    refillAmount: t.integer("refill_amount"),
    refillInterval: t.integer("refill_interval"),
    remaining: t.integer(),
    requestCount: t.integer("request_count").notNull().default(0),
    start: t.text(),
    updatedAt: t
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userId: t
      .uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  }),
  (table) => [index("apikey_userId_idx").on(table.userId)]
);
