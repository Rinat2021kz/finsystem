-- ============================================================
-- Финансовая учётная система для малого бизнеса — схема БД
-- PostgreSQL. Стартовая версия (MVP + задел под v2/v3).
-- ============================================================
--
-- КЛЮЧЕВЫЕ СОГЛАШЕНИЯ (обязательны, см. CLAUDE.md):
--  * Деньги хранятся ЦЕЛЫМ числом в МИНОРНЫХ единицах (тиын): 1 тенге = 100 тиын.
--    Поля вида *_minor имеют тип BIGINT. Никаких float для денег.
--  * date_cashflow — дата фактического движения денег (для ДДС).
--    period_pnl — месяц, к которому доход/расход относится экономически (для ОПУ).
--    Это РАЗНЫЕ вещи и их нельзя смешивать.
--  * Перевод (type='transfer') НЕ доход и НЕ расход: влияет только на остатки счетов.
--  * Все проценты — NUMERIC(9,4) (например 0.0500 = 5%).
--  * Расчётные величины (маржа, долг, рентабельность, остатки) НЕ хранятся в oper0ationных
--    таблицах, а вычисляются расчётным модулем. Исключение — report_snapshots (закрытые месяцы).
--
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- для gen_random_uuid()

-- ---------- Перечисления ----------
CREATE TYPE user_status       AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE member_role       AS ENUM ('owner', 'consultant', 'accountant', 'manager', 'viewer', 'investor');
CREATE TYPE account_type       AS ENUM ('bank', 'cash', 'card', 'deposit', 'reserve', 'owner_personal', 'other');
CREATE TYPE category_type      AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE txn_type           AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE project_status     AS ENUM ('new', 'in_progress', 'on_hold', 'done', 'cancelled', 'paid', 'has_debt');
CREATE TYPE expense_plan_type  AS ENUM ('fixed', 'percent_of_revenue', 'per_unit', 'one_time', 'payroll', 'tax', 'debt_interest');
CREATE TYPE investment_section AS ENUM ('capex', 'launch', 'operating_buffer', 'reserve', 'other');

-- ---------- Пользователи ----------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    email         TEXT        UNIQUE,
    phone         TEXT        UNIQUE,
    password_hash TEXT,                      -- NULL для клиентов, входящих только по share-ссылке
    status        user_status NOT NULL DEFAULT 'active',
    locale        TEXT        NOT NULL DEFAULT 'ru',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Компании (бизнесы клиентов) ----------
CREATE TABLE companies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name                  TEXT NOT NULL,
    industry              TEXT,                          -- отрасль / отраслевой шаблон
    currency              TEXT NOT NULL DEFAULT 'KZT',   -- одна валюта на компанию (MVP)
    accounting_start_date DATE NOT NULL,
    timezone              TEXT NOT NULL DEFAULT 'Asia/Almaty',
    tax_regime            TEXT,                          -- задел; в MVP налоги — обычная статья расходов
    capex_mode            TEXT NOT NULL DEFAULT 'simple',-- 'simple' (капзатраты в ОПУ сразу) | 'depreciation'
    projects_enabled      BOOLEAN NOT NULL DEFAULT false,
    investments_enabled   BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Участники компании (роли/права; кабинет консультанта) ----------
-- Один пользователь может состоять в нескольких компаниях с разными ролями.
-- Консультант = пользователь с ролью 'consultant' в компаниях своих клиентов.
CREATE TABLE company_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        member_role NOT NULL,
    invited_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id)
);

-- ---------- Счета и кассы ----------
CREATE TABLE accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,               -- Kaspi, Halyk, Наличные, ...
    type                 account_type NOT NULL DEFAULT 'bank',
    currency             TEXT NOT NULL DEFAULT 'KZT',
    opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    opening_balance_date  DATE NOT NULL,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_company ON accounts(company_id);

-- ---------- Категории доходов/расходов (с иерархией) ----------
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type            category_type NOT NULL,
    parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL, -- подкатегория = дочерняя
    name            TEXT NOT NULL,
    affects_pnl     BOOLEAN NOT NULL DEFAULT true,   -- участвует ли в ОПУ
    affects_cashflow BOOLEAN NOT NULL DEFAULT true,  -- участвует ли в ДДС
    is_capex        BOOLEAN NOT NULL DEFAULT false,
    is_transfer     BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_company ON categories(company_id);

-- ---------- Контрагенты ----------
CREATE TABLE counterparties (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT,          -- клиент / поставщик / сотрудник / прочее
    contact     TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_counterparties_company ON counterparties(company_id);

-- ---------- Продукты/услуги (для планирования продаж) ----------
CREATE TABLE products (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    unit           TEXT,                         -- шт, час, заказ ...
    base_price_minor BIGINT NOT NULL DEFAULT 0,
    cost_per_unit_minor BIGINT NOT NULL DEFAULT 0, -- переменная себестоимость единицы
    is_active      BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_products_company ON products(company_id);

-- ---------- Проекты/заказы ----------
CREATE TABLE projects (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_number      TEXT,
    customer_name       TEXT,
    description         TEXT,
    category            TEXT,
    contract_value_minor BIGINT NOT NULL DEFAULT 0,  -- договорная стоимость
    status              project_status NOT NULL DEFAULT 'new',
    order_date          DATE,
    close_date          DATE,
    responsible_user_id UUID REFERENCES users(id),
    planned_cost_minor  BIGINT NOT NULL DEFAULT 0,   -- плановая себестоимость
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    -- Расчётные (paid_fact, debt, project_expenses, margin, profitability) НЕ хранятся — считаются.
);
CREATE INDEX idx_projects_company ON projects(company_id);

-- ---------- Операции (главная таблица) ----------
CREATE TABLE transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    date_cashflow    DATE NOT NULL,                 -- дата движения денег (ДДС)
    period_pnl       DATE,                          -- 1-е число месяца ОПУ; NULL если не в ОПУ
    type             txn_type NOT NULL,
    category_id      UUID REFERENCES categories(id),-- лист-категория; родитель берётся через parent_id
    amount_minor     BIGINT NOT NULL CHECK (amount_minor >= 0), -- всегда положительная; знак задаёт type
    account_from_id  UUID REFERENCES accounts(id),  -- откуда (расход/перевод)
    account_to_id    UUID REFERENCES accounts(id),  -- куда (доход/перевод)
    project_id       UUID REFERENCES projects(id),
    counterparty_id  UUID REFERENCES counterparties(id),
    comment          TEXT,
    attachment_url   TEXT,
    include_in_pnl   BOOLEAN NOT NULL DEFAULT true,  -- переопределяет категорию при необходимости
    include_in_cashflow BOOLEAN NOT NULL DEFAULT true,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_company_cashdate ON transactions(company_id, date_cashflow);
CREATE INDEX idx_txn_company_pnl      ON transactions(company_id, period_pnl);
CREATE INDEX idx_txn_project          ON transactions(project_id);

-- ---------- План продаж ----------
CREATE TABLE sales_plan (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id        UUID REFERENCES products(id),
    month             DATE NOT NULL,                 -- 1-е число месяца
    planned_price_minor BIGINT NOT NULL DEFAULT 0,
    planned_quantity  NUMERIC(14,2) NOT NULL DEFAULT 0, -- допускаем дробь в прогнозе
    growth_rate       NUMERIC(9,4) NOT NULL DEFAULT 0,
    seasonality_factor NUMERIC(9,4) NOT NULL DEFAULT 1
    -- planned_revenue считается: price × quantity × seasonality
);
CREATE INDEX idx_sales_plan_company ON sales_plan(company_id, month);

-- ---------- План расходов ----------
CREATE TABLE expense_plan (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id        UUID REFERENCES categories(id),
    month              DATE NOT NULL,
    expense_type       expense_plan_type NOT NULL,
    amount_minor       BIGINT DEFAULT 0,             -- для fixed / one_time / payroll
    percent_of_revenue NUMERIC(9,4),                 -- для percent_of_revenue / tax
    amount_per_unit_minor BIGINT,                    -- для per_unit
    product_id         UUID REFERENCES products(id), -- к какому продукту привязан per_unit
    comment            TEXT
);
CREATE INDEX idx_expense_plan_company ON expense_plan(company_id, month);

-- ---------- Инвестиционные сценарии ----------
CREATE TABLE investment_models (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                   TEXT NOT NULL,
    start_month            DATE NOT NULL,
    horizon_months         INT NOT NULL DEFAULT 12,
    valuation_method       TEXT,                      -- 'net_profit_multiple' | 'revenue_multiple' | 'manual'
    company_valuation_minor BIGINT DEFAULT 0,
    investment_amount_minor BIGINT DEFAULT 0,
    dividend_policy_percent NUMERIC(9,4) DEFAULT 0,   -- доля прибыли на дивиденды
    investor_share         NUMERIC(9,4) DEFAULT 0,    -- может считаться или задаваться
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invest_models_company ON investment_models(company_id);

-- ---------- Статьи инвестиций ----------
CREATE TABLE investment_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    investment_model_id UUID NOT NULL REFERENCES investment_models(id) ON DELETE CASCADE,
    section             investment_section NOT NULL,
    item_name           TEXT NOT NULL,
    monthly_cost_minor  BIGINT NOT NULL DEFAULT 0,
    months_count        INT NOT NULL DEFAULT 1,
    total_cost_minor    BIGINT NOT NULL DEFAULT 0,    -- обычно monthly × months
    comment             TEXT
);
CREATE INDEX idx_invest_items_model ON investment_items(investment_model_id);

-- ---------- Снимки закрытых месяцев ----------
CREATE TABLE report_snapshots (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period           DATE NOT NULL,                  -- 1-е число закрытого месяца
    is_closed        BOOLEAN NOT NULL DEFAULT true,
    revenue_minor    BIGINT NOT NULL DEFAULT 0,
    expenses_minor   BIGINT NOT NULL DEFAULT 0,
    net_profit_minor BIGINT NOT NULL DEFAULT 0,
    cash_in_minor    BIGINT NOT NULL DEFAULT 0,
    cash_out_minor   BIGINT NOT NULL DEFAULT 0,
    opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    closing_balance_minor BIGINT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, period)
);

-- ---------- Журнал изменений (доверие к данным) ----------
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    entity      TEXT NOT NULL,        -- 'transaction', 'project', ...
    entity_id   UUID,
    action      TEXT NOT NULL,        -- 'create' | 'update' | 'delete' | 'close_month' | 'reopen_month'
    before_json JSONB,
    after_json  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_company ON audit_log(company_id, created_at);

-- ============================================================
-- НАШИ РАСШИРЕНИЯ (из ранних решений проекта)
-- ============================================================

-- ---------- Настройки дашборда (консультант задаёт старт, клиент прячет/укрупняет) ----------
-- config_json хранит: список виджетов, их видимость, размер/детализацию,
-- какие поля выведены как ползунки «что если», текстовые комментарии консультанта,
-- пороги для светофора (красный/жёлтый/зелёный) и рекомендации «что делать».
CREATE TABLE dashboard_configs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          TEXT NOT NULL DEFAULT 'default',
    created_by    UUID REFERENCES users(id),         -- обычно консультант
    config_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dashboard_company ON dashboard_configs(company_id);

-- ---------- Ссылки для доступа клиента без аккаунта ----------
-- Консультант генерирует ссылку с ролью (обычно 'viewer' или 'owner-lite') и привязанным дашбордом.
CREATE TABLE share_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    token               TEXT NOT NULL UNIQUE,        -- случайный, кладётся в URL
    role                member_role NOT NULL DEFAULT 'viewer',
    dashboard_config_id UUID REFERENCES dashboard_configs(id),
    can_edit_inputs     BOOLEAN NOT NULL DEFAULT true, -- разрешить клиенту двигать ползунки/вводить цифры
    created_by          UUID REFERENCES users(id),
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_share_links_company ON share_links(company_id);

-- Примечание для разработчика: все выборки ОБЯЗАТЕЛЬНО фильтруются по company_id
-- (мультитенантность). На уровне приложения проверять членство пользователя в company_members.
