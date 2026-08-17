-- История себестоимости продукта: закупки происходят в разные периоды, цена меняется.
-- Каждая запись — «с какой даты действует эта себестоимость единицы».
-- Нужна, чтобы маржа прошлых месяцев считалась по цене, действовавшей тогда,
-- а не по сегодняшней.

-- CreateTable
CREATE TABLE "product_cost_history" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "unit_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_cost_history_product_id_valid_from_idx" ON "product_cost_history"("product_id", "valid_from");

-- одна запись на продукт и дату: повторный ввод обновляет существующую
CREATE UNIQUE INDEX "product_cost_history_product_id_valid_from_key" ON "product_cost_history"("product_id", "valid_from");

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Стартовая точка истории для уже заведённых продуктов: текущая себестоимость
-- действует с даты начала учёта компании — иначе прошлые продажи остались бы без цены.
INSERT INTO "product_cost_history" ("id", "company_id", "product_id", "valid_from", "unit_cost_minor", "comment")
SELECT gen_random_uuid(), p."company_id", p."id", c."accounting_start_date", p."cost_per_unit_minor",
       'Перенесено из карточки продукта'
FROM "products" p
JOIN "companies" c ON c."id" = p."company_id"
WHERE p."cost_per_unit_minor" > 0;
