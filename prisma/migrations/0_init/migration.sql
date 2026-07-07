-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'invited', 'disabled');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('owner', 'consultant', 'accountant', 'manager', 'viewer', 'investor');

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('bank', 'cash', 'card', 'deposit', 'reserve', 'owner_personal', 'other');

-- CreateEnum
CREATE TYPE "category_type" AS ENUM ('income', 'expense', 'transfer');

-- CreateEnum
CREATE TYPE "txn_type" AS ENUM ('income', 'expense', 'transfer');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('new', 'in_progress', 'on_hold', 'done', 'cancelled', 'paid', 'has_debt');

-- CreateEnum
CREATE TYPE "expense_plan_type" AS ENUM ('fixed', 'percent_of_revenue', 'per_unit', 'one_time', 'payroll', 'tax', 'debt_interest');

-- CreateEnum
CREATE TYPE "investment_section" AS ENUM ('capex', 'launch', 'operating_buffer', 'reserve', 'other');

-- CreateEnum
CREATE TYPE "pnl_group" AS ENUM ('revenue', 'variable', 'fixed', 'payroll', 'tax', 'interest', 'depreciation', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "accounting_start_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "tax_regime" TEXT,
    "capex_mode" TEXT NOT NULL DEFAULT 'simple',
    "projects_enabled" BOOLEAN NOT NULL DEFAULT false,
    "investments_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "member_role" NOT NULL,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "account_type" NOT NULL DEFAULT 'bank',
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "opening_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "opening_balance_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" "category_type" NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "affects_pnl" BOOLEAN NOT NULL DEFAULT true,
    "affects_cashflow" BOOLEAN NOT NULL DEFAULT true,
    "is_capex" BOOLEAN NOT NULL DEFAULT false,
    "is_transfer" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pnl_group" "pnl_group" NOT NULL DEFAULT 'other',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparties" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "contact" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "base_price_minor" BIGINT NOT NULL DEFAULT 0,
    "cost_per_unit_minor" BIGINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_number" TEXT,
    "customer_name" TEXT,
    "description" TEXT,
    "category" TEXT,
    "contract_value_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "project_status" NOT NULL DEFAULT 'new',
    "order_date" DATE,
    "close_date" DATE,
    "responsible_user_id" UUID,
    "planned_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "date_cashflow" DATE NOT NULL,
    "period_pnl" DATE,
    "type" "txn_type" NOT NULL,
    "category_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "account_from_id" UUID,
    "account_to_id" UUID,
    "project_id" UUID,
    "counterparty_id" UUID,
    "comment" TEXT,
    "attachment_url" TEXT,
    "include_in_pnl" BOOLEAN NOT NULL DEFAULT true,
    "include_in_cashflow" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_snapshots" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT true,
    "revenue_minor" BIGINT NOT NULL DEFAULT 0,
    "expenses_minor" BIGINT NOT NULL DEFAULT 0,
    "net_profit_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_in_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_out_minor" BIGINT NOT NULL DEFAULT 0,
    "opening_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "closing_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "company_id" UUID,
    "user_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "action" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_configs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "created_by" UUID,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'viewer',
    "dashboard_config_id" UUID,
    "can_edit_inputs" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_company_id_user_id_key" ON "company_members"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "accounts_company_id_idx" ON "accounts"("company_id");

-- CreateIndex
CREATE INDEX "categories_company_id_idx" ON "categories"("company_id");

-- CreateIndex
CREATE INDEX "counterparties_company_id_idx" ON "counterparties"("company_id");

-- CreateIndex
CREATE INDEX "products_company_id_idx" ON "products"("company_id");

-- CreateIndex
CREATE INDEX "projects_company_id_idx" ON "projects"("company_id");

-- CreateIndex
CREATE INDEX "transactions_company_id_date_cashflow_idx" ON "transactions"("company_id", "date_cashflow");

-- CreateIndex
CREATE INDEX "transactions_company_id_period_pnl_idx" ON "transactions"("company_id", "period_pnl");

-- CreateIndex
CREATE INDEX "transactions_project_id_idx" ON "transactions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_snapshots_company_id_period_key" ON "report_snapshots"("company_id", "period");

-- CreateIndex
CREATE INDEX "audit_log_company_id_created_at_idx" ON "audit_log"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "dashboard_configs_company_id_idx" ON "dashboard_configs"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_company_id_idx" ON "share_links"("company_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_from_id_fkey" FOREIGN KEY ("account_from_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_to_id_fkey" FOREIGN KEY ("account_to_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

