-- Факт-проверка себестоимости: операция дохода может быть привязана к продукту
-- с указанием проданного количества (для сравнения план/факт по рецептуре).

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "product_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "quantity" DECIMAL(14,2);

-- CreateIndex
CREATE INDEX "transactions_product_id_idx" ON "transactions"("product_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
