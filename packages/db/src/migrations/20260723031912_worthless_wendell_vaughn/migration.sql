CREATE TYPE "account_type" AS ENUM('debit', 'cash', 'investment', 'cc', 'savings', 'loan', 'vouchers', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"access_token" text,
	"access_token_expires_at" timestamp,
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY,
	"id_token" text,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"updated_at" timestamp NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" date,
	"id" uuid PRIMARY KEY,
	"key" text NOT NULL,
	"last_refill_at" date,
	"last_request" timestamp,
	"metadata" jsonb,
	"name" text,
	"permissions" text,
	"prefix" text,
	"rate_limit_enabled" boolean DEFAULT false NOT NULL,
	"rate_limit_max" integer,
	"rate_limit_time_window" integer,
	"refill_amount" integer,
	"refill_interval" integer,
	"remaining" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"start" text,
	"updated_at" timestamp NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY,
	"ip_address" text,
	"token" text NOT NULL UNIQUE,
	"updated_at" timestamp NOT NULL,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY,
	"image" text,
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY,
	"identifier" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"account_id" uuid NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"deleted_at" timestamp with time zone,
	"description" text,
	"embedding" vector(1536),
	"exchange_rate" numeric(15,8) DEFAULT '1.00000000' NOT NULL,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_deferred" boolean DEFAULT false NOT NULL,
	"original_currency" text NOT NULL,
	"semantic_text" text,
	"title" text NOT NULL,
	"total_installments" integer,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_category" (
	"color" text DEFAULT 'blue' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"description" text,
	"icon_name" text DEFAULT 'Tag',
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_category_relation" (
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expense_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_installment" (
	"amount" numeric(15,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text NOT NULL,
	"expense_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"installment_number" integer NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paid_date" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement" (
	"account_id" uuid NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"deleted_at" timestamp with time zone,
	"description" text,
	"exchange_rate" numeric(15,8) DEFAULT '1.00000000' NOT NULL,
	"expense_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"original_currency" text NOT NULL,
	"reimbursement_date" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_account" (
	"account_type" "account_type" DEFAULT 'cash'::"account_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credit_limit" numeric(15,2) DEFAULT '0.00',
	"currency" text DEFAULT 'MXN' NOT NULL,
	"deleted_at" timestamp with time zone,
	"description" text,
	"icon_name" text DEFAULT 'CreditCard' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initial_amount" numeric(15,2) DEFAULT '0.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_expense_account" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income" (
	"account_id" uuid NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"category_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"deleted_at" timestamp with time zone,
	"description" text,
	"embedding" vector(1536),
	"exchange_rate" numeric(15,8) DEFAULT '1.00000000' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"income_date" timestamp with time zone DEFAULT now() NOT NULL,
	"original_currency" text NOT NULL,
	"semantic_text" text,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_category" (
	"color" text DEFAULT 'blue' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"description" text,
	"icon_name" text DEFAULT 'DollarSign',
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"completed" boolean DEFAULT false NOT NULL,
	"id" serial PRIMARY KEY,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer" (
	"amount" numeric(15,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"deleted_at" timestamp with time zone,
	"embedding" vector(1536),
	"from_account_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_expense" boolean DEFAULT false NOT NULL,
	"notes" text,
	"semantic_text" text,
	"to_account_id" uuid NOT NULL,
	"transfer_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_userId_idx" ON "apikey" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "expense_embedding_idx" ON "expense" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "income_embedding_idx" ON "income" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "transfer_embedding_idx" ON "transfer" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_category_relation" ADD CONSTRAINT "expense_category_relation_category_id_expense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_category_relation" ADD CONSTRAINT "expense_category_relation_expense_id_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_installment" ADD CONSTRAINT "expense_installment_expense_id_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_installment" ADD CONSTRAINT "expense_installment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_expense_id_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_category_id_income_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "income_category"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "income_category" ADD CONSTRAINT "income_category_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_from_account_id_financial_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "financial_account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_to_account_id_financial_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "financial_account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;