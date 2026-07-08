-- CreateTable
CREATE TABLE "sales_plan" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID,
    "month" DATE NOT NULL,
    "planned_price_minor" BIGINT NOT NULL DEFAULT 0,
    "planned_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "growth_rate" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "seasonality_factor" DECIMAL(9,4) NOT NULL DEFAULT 1,

    CONSTRAINT "sales_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_plan" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "category_id" UUID,
    "month" DATE NOT NULL,
    "expense_type" "expense_plan_type" NOT NULL,
    "amount_minor" BIGINT DEFAULT 0,
    "percent_of_revenue" DECIMAL(9,4),
    "amount_per_unit_minor" BIGINT,
    "product_id" UUID,
    "comment" TEXT,

    CONSTRAINT "expense_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_models" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_month" DATE NOT NULL,
    "horizon_months" INTEGER NOT NULL DEFAULT 12,
    "valuation_method" TEXT,
    "company_valuation_minor" BIGINT DEFAULT 0,
    "investment_amount_minor" BIGINT DEFAULT 0,
    "dividend_policy_percent" DECIMAL(9,4) DEFAULT 0,
    "investor_share" DECIMAL(9,4) DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "investment_model_id" UUID NOT NULL,
    "section" "investment_section" NOT NULL,
    "item_name" TEXT NOT NULL,
    "monthly_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "months_count" INTEGER NOT NULL DEFAULT 1,
    "total_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "comment" TEXT,

    CONSTRAINT "investment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_plan_company_id_month_idx" ON "sales_plan"("company_id", "month");

-- CreateIndex
CREATE INDEX "expense_plan_company_id_month_idx" ON "expense_plan"("company_id", "month");

-- CreateIndex
CREATE INDEX "investment_models_company_id_idx" ON "investment_models"("company_id");

-- CreateIndex
CREATE INDEX "investment_items_investment_model_id_idx" ON "investment_items"("investment_model_id");

-- AddForeignKey
ALTER TABLE "investment_items" ADD CONSTRAINT "investment_items_investment_model_id_fkey" FOREIGN KEY ("investment_model_id") REFERENCES "investment_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

