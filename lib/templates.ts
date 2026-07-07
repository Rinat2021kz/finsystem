// Отраслевые шаблоны стартовых справочников (SPEC разделы 2 и 8).
// Создаются при онбординге; дальше клиент настраивает категории под себя.

import type { AccountType, CategoryType, PnlGroup } from "@prisma/client";

export interface TemplateAccount {
  name: string;
  type: AccountType;
}

export interface TemplateCategory {
  name: string;
  type: CategoryType;
  pnlGroup: PnlGroup;
  isCapex?: boolean;
  children?: string[];
}

export interface IndustryTemplate {
  id: string;
  label: string;
  accounts: TemplateAccount[];
  categories: TemplateCategory[];
}

const BASE_ACCOUNTS: TemplateAccount[] = [
  { name: "Kaspi", type: "bank" },
  { name: "Halyk", type: "bank" },
  { name: "Наличные", type: "cash" },
];

const COMMON_EXPENSES: TemplateCategory[] = [
  { name: "Аренда", type: "expense", pnlGroup: "fixed" },
  { name: "Зарплата", type: "expense", pnlGroup: "payroll" },
  { name: "Налоги", type: "expense", pnlGroup: "tax" },
  { name: "Маркетинг и реклама", type: "expense", pnlGroup: "fixed" },
  { name: "Связь и интернет", type: "expense", pnlGroup: "fixed" },
  { name: "Банковские комиссии", type: "expense", pnlGroup: "fixed" },
  { name: "Проценты по займам", type: "expense", pnlGroup: "interest" },
  { name: "Оборудование (капзатраты)", type: "expense", pnlGroup: "fixed", isCapex: true },
  { name: "Прочие расходы", type: "expense", pnlGroup: "other" },
];

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: "universal",
    label: "Универсальный малый бизнес",
    accounts: BASE_ACCOUNTS,
    categories: [
      { name: "Выручка", type: "income", pnlGroup: "revenue" },
      { name: "Прочие поступления", type: "income", pnlGroup: "revenue" },
      { name: "Себестоимость", type: "expense", pnlGroup: "variable" },
      ...COMMON_EXPENSES,
    ],
  },
  {
    id: "services",
    label: "Услуги / консалтинг",
    accounts: BASE_ACCOUNTS,
    categories: [
      { name: "Оплата услуг", type: "income", pnlGroup: "revenue" },
      { name: "Подрядчики", type: "expense", pnlGroup: "variable" },
      { name: "Транспорт и командировки", type: "expense", pnlGroup: "variable" },
      ...COMMON_EXPENSES,
    ],
  },
  {
    id: "online_education",
    label: "Онлайн-образование",
    accounts: BASE_ACCOUNTS,
    categories: [
      { name: "Продажа курсов", type: "income", pnlGroup: "revenue" },
      { name: "Наставничество", type: "income", pnlGroup: "revenue" },
      { name: "Кураторы и спикеры", type: "expense", pnlGroup: "variable" },
      { name: "Платформа и сервисы", type: "expense", pnlGroup: "fixed" },
      { name: "Таргет и трафик", type: "expense", pnlGroup: "variable" },
      ...COMMON_EXPENSES,
    ],
  },
  {
    id: "coffee_shop",
    label: "Кофейня / заведение",
    accounts: BASE_ACCOUNTS,
    categories: [
      { name: "Выручка зала", type: "income", pnlGroup: "revenue" },
      { name: "Доставка", type: "income", pnlGroup: "revenue" },
      { name: "Продукты и сырьё", type: "expense", pnlGroup: "variable" },
      { name: "Упаковка", type: "expense", pnlGroup: "variable" },
      { name: "Коммунальные услуги", type: "expense", pnlGroup: "fixed" },
      ...COMMON_EXPENSES,
    ],
  },
  {
    id: "retail",
    label: "Торговля",
    accounts: BASE_ACCOUNTS,
    categories: [
      { name: "Продажи товаров", type: "income", pnlGroup: "revenue" },
      { name: "Закуп товара", type: "expense", pnlGroup: "variable" },
      { name: "Логистика", type: "expense", pnlGroup: "variable" },
      { name: "Торговая точка", type: "expense", pnlGroup: "fixed" },
      ...COMMON_EXPENSES,
    ],
  },
  {
    id: "project_business",
    label: "Проектный бизнес",
    accounts: BASE_ACCOUNTS,
    categories: [
      { name: "Оплаты по проектам", type: "income", pnlGroup: "revenue" },
      { name: "Материалы по проектам", type: "expense", pnlGroup: "variable" },
      { name: "Субподряд", type: "expense", pnlGroup: "variable" },
      ...COMMON_EXPENSES,
    ],
  },
];

export function getTemplate(id: string): IndustryTemplate {
  return INDUSTRY_TEMPLATES.find((t) => t.id === id) ?? INDUSTRY_TEMPLATES[0];
}
