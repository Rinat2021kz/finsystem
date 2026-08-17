-- Складской учёт: склады/точки и движения товара.
-- Остатки и себестоимость не хранятся (правило 8) — считаются на лету
-- из движений в lib/calc/stock.ts. Перемещение между складами не меняет
-- общий остаток компании, только распределение по складам (аналог правила 3).

-- CreateEnum
CREATE TYPE "stock_move_type" AS ENUM ('receipt', 'issue', 'transfer', 'writeoff');

-- AlterTable: модуль склада включается отдельно, как проекты и инвестиции
ALTER TABLE "companies" ADD COLUMN "stock_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: товар vs услуга, товар vs материал, группа для отчётов
ALTER TABLE "products" ADD COLUMN "product_group" TEXT;
ALTER TABLE "products" ADD COLUMN "is_sellable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN "tracks_stock" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'point',
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_company_id_idx" ON "warehouses"("company_id");

-- CreateTable
CREATE TABLE "stock_moves" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "stock_move_type" NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_from_id" UUID,
    "warehouse_to_id" UUID,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost_minor" BIGINT,
    "transaction_id" UUID,
    "project_id" UUID,
    "comment" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_moves_company_id_date_idx" ON "stock_moves"("company_id", "date");
CREATE INDEX "stock_moves_company_id_product_id_date_idx" ON "stock_moves"("company_id", "product_id", "date");
CREATE INDEX "stock_moves_transaction_id_idx" ON "stock_moves"("transaction_id");
CREATE INDEX "stock_moves_project_id_idx" ON "stock_moves"("project_id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_warehouse_from_id_fkey" FOREIGN KEY ("warehouse_from_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_warehouse_to_id_fkey" FOREIGN KEY ("warehouse_to_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
