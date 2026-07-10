-- CreateTable
CREATE TABLE "product_components" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'per_unit',
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unit_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "percent" DECIMAL(9,4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_components_product_id_idx" ON "product_components"("product_id");

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

