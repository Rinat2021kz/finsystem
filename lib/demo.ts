// Демо-режим: компания «Демо-кофейня „Арман“» с данными за 2025 год и 1-е полугодие 2026.
// Данные генерируются детерминированно (один и тот же результат после каждого сброса)
// и покрывают весь функционал: ДДС ≠ ОПУ, переводы, капзатраты, проекты с долгом,
// рецептура + факт продаж по продуктам, планы с сезонностью, инвестсценарий,
// закрытые месяцы, клиентская ссылка, комментарий консультанта.

import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { monthEnd, monthStart } from "@/lib/period";
import { loadCalcData } from "@/lib/reports";
import { cashflowSummary } from "@/lib/calc/cashflow";
import { pnlForMonth } from "@/lib/calc/pnl";

export const DEMO_EMAIL = "demo@finsystem.kz";
export const DEMO_PASSWORD = "demo2026";
export const DEMO_COMPANY_NAME = "Демо-кофейня «Арман»";
const DEMO_CONSULTANT_EMAIL = "consultant-demo@finsystem.kz";
const DEMO_SHARE_TOKEN = "demo-arman-2026";

/** Тенге → тиын. */
function t(tenge: number): bigint {
  return BigInt(Math.round(tenge)) * 100n;
}

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

/** Детерминированный ГПСЧ (mulberry32) — демо всегда выглядит одинаково. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Сезонность кофейни: зима — пик, лето — спад (индекс = месяц 1..12).
const SEASON = [1.15, 1.1, 1.05, 1.0, 0.9, 0.8, 0.75, 0.8, 1.0, 1.1, 1.15, 1.2];

interface DrinkSpec {
  name: string;
  unit: string;
  priceMinor: bigint;
  costMinor: bigint;
  baseQty: number; // базовые продажи в месяц (уровень января 2025)
  components: Array<{
    name: string;
    kind: "per_unit" | "percent_of_price";
    quantity: number;
    unit: string | null;
    unitCostMinor: bigint;
    percent: number | null;
  }>;
}

const DRINKS: DrinkSpec[] = [
  {
    name: "Капучино", unit: "шт", priceMinor: t(1500), costMinor: t(350), baseQty: 620,
    components: [
      { name: "Зерно", kind: "per_unit", quantity: 0.018, unit: "кг", unitCostMinor: t(9000), percent: null },
      { name: "Молоко", kind: "per_unit", quantity: 0.18, unit: "л", unitCostMinor: t(600), percent: null },
      { name: "Стакан и крышка", kind: "per_unit", quantity: 1, unit: "шт", unitCostMinor: t(50), percent: null },
      { name: "Комиссия Kaspi", kind: "percent_of_price", quantity: 1, unit: null, unitCostMinor: 0n, percent: 0.02 },
    ],
  },
  {
    name: "Латте", unit: "шт", priceMinor: t(1600), costMinor: t(376), baseQty: 480,
    components: [
      { name: "Зерно", kind: "per_unit", quantity: 0.018, unit: "кг", unitCostMinor: t(9000), percent: null },
      { name: "Молоко", kind: "per_unit", quantity: 0.22, unit: "л", unitCostMinor: t(600), percent: null },
      { name: "Стакан и крышка", kind: "per_unit", quantity: 1, unit: "шт", unitCostMinor: t(50), percent: null },
      { name: "Комиссия Kaspi", kind: "percent_of_price", quantity: 1, unit: null, unitCostMinor: 0n, percent: 0.02 },
    ],
  },
  {
    name: "Американо", unit: "шт", priceMinor: t(1000), costMinor: t(232), baseQty: 400,
    components: [
      { name: "Зерно", kind: "per_unit", quantity: 0.018, unit: "кг", unitCostMinor: t(9000), percent: null },
      { name: "Стакан и крышка", kind: "per_unit", quantity: 1, unit: "шт", unitCostMinor: t(50), percent: null },
      { name: "Комиссия Kaspi", kind: "percent_of_price", quantity: 1, unit: null, unitCostMinor: 0n, percent: 0.02 },
    ],
  },
  {
    name: "Раф", unit: "шт", priceMinor: t(1900), costMinor: t(490), baseQty: 180,
    components: [
      { name: "Зерно", kind: "per_unit", quantity: 0.018, unit: "кг", unitCostMinor: t(9000), percent: null },
      { name: "Сливки", kind: "per_unit", quantity: 0.15, unit: "л", unitCostMinor: t(1200), percent: null },
      { name: "Сироп", kind: "per_unit", quantity: 0.02, unit: "л", unitCostMinor: t(3000), percent: null },
      { name: "Стакан и крышка", kind: "per_unit", quantity: 1, unit: "шт", unitCostMinor: t(50), percent: null },
      { name: "Комиссия Kaspi", kind: "percent_of_price", quantity: 1, unit: null, unitCostMinor: 0n, percent: 0.02 },
    ],
  },
];

/** Компания демо-пользователя (null, если демо ещё не создавалось). */
export async function findDemoCompanyId(): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { ownedCompanies: { select: { id: true } } },
  });
  return user?.ownedCompanies[0]?.id ?? null;
}

export async function isDemoCompany(companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { owner: { select: { email: true } } },
  });
  return company?.owner.email === DEMO_EMAIL;
}

/** Демо-компания существует → вернуть id; нет → создать и наполнить. */
export async function ensureDemoCompany(): Promise<string> {
  const existing = await findDemoCompanyId();
  if (existing) return existing;
  return seedDemoCompany();
}

/** Полный сброс: удалить демо-компанию со всеми данными и налить заново. */
export async function resetDemoCompany(): Promise<string> {
  const companyId = await findDemoCompanyId();
  if (companyId) {
    // таблицы без FK-каскада на компанию чистим вручную
    await prisma.$transaction([
      prisma.salesPlan.deleteMany({ where: { companyId } }),
      prisma.expensePlan.deleteMany({ where: { companyId } }),
      prisma.investmentItem.deleteMany({ where: { companyId } }),
      prisma.investmentModel.deleteMany({ where: { companyId } }),
      prisma.shareLink.deleteMany({ where: { companyId } }),
      prisma.dashboardConfig.deleteMany({ where: { companyId } }),
      prisma.auditLog.deleteMany({ where: { companyId } }),
    ]);
    await prisma.company.delete({ where: { id: companyId } }); // каскад: счета, операции, продукты…
  }
  return seedDemoCompany();
}

async function seedDemoCompany(): Promise<string> {
  const rng = mulberry32(20260710);

  // --- пользователи ---
  const passwordHash = await hash(DEMO_PASSWORD, 10);
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { name: "Демо-владелец", email: DEMO_EMAIL, passwordHash },
    update: { passwordHash, status: "active" },
  });
  const consultant = await prisma.user.upsert({
    where: { email: DEMO_CONSULTANT_EMAIL },
    create: { name: "Демо-консультант", email: DEMO_CONSULTANT_EMAIL, status: "invited" },
    update: {},
  });

  // --- компания и участники ---
  const company = await prisma.company.create({
    data: {
      ownerUserId: demoUser.id,
      name: DEMO_COMPANY_NAME,
      industry: "coffee_shop",
      currency: "KZT",
      accountingStartDate: d(2025, 1, 1),
      projectsEnabled: true,
      investmentsEnabled: true,
    },
  });
  const companyId = company.id;
  await prisma.companyMember.createMany({
    data: [
      { companyId, userId: demoUser.id, role: "owner" },
      { companyId, userId: consultant.id, role: "consultant", invitedBy: demoUser.id },
    ],
  });

  // --- счета ---
  await prisma.account.createMany({
    data: [
      { companyId, name: "Kaspi Pay", type: "bank", openingBalanceMinor: t(1_200_000), openingBalanceDate: d(2025, 1, 1) },
      { companyId, name: "Halyk расчётный", type: "bank", openingBalanceMinor: t(2_500_000), openingBalanceDate: d(2025, 1, 1) },
      { companyId, name: "Касса (наличные)", type: "cash", openingBalanceMinor: t(150_000), openingBalanceDate: d(2025, 1, 1) },
    ],
  });
  const accounts = await prisma.account.findMany({ where: { companyId } });
  const kaspi = accounts.find((a) => a.name === "Kaspi Pay")!.id;
  const halyk = accounts.find((a) => a.name === "Halyk расчётный")!.id;
  const cash = accounts.find((a) => a.name === "Касса (наличные)")!.id;

  // --- категории (шаблон «кофейня» + кейтеринг) ---
  await prisma.category.createMany({
    data: [
      { companyId, type: "income", name: "Выручка зала", pnlGroup: "revenue" },
      { companyId, type: "income", name: "Доставка", pnlGroup: "revenue" },
      { companyId, type: "income", name: "Кейтеринг и мероприятия", pnlGroup: "revenue" },
      { companyId, type: "expense", name: "Продукты и сырьё", pnlGroup: "variable" },
      { companyId, type: "expense", name: "Упаковка", pnlGroup: "variable" },
      { companyId, type: "expense", name: "Коммунальные услуги", pnlGroup: "fixed" },
      { companyId, type: "expense", name: "Аренда", pnlGroup: "fixed" },
      { companyId, type: "expense", name: "Зарплата", pnlGroup: "payroll" },
      { companyId, type: "expense", name: "Налоги", pnlGroup: "tax" },
      { companyId, type: "expense", name: "Маркетинг и реклама", pnlGroup: "fixed" },
      { companyId, type: "expense", name: "Связь и интернет", pnlGroup: "fixed" },
      { companyId, type: "expense", name: "Банковские комиссии", pnlGroup: "fixed" },
      { companyId, type: "expense", name: "Оборудование (капзатраты)", pnlGroup: "fixed", isCapex: true },
      { companyId, type: "expense", name: "Прочие расходы", pnlGroup: "other" },
    ],
  });
  const categories = await prisma.category.findMany({ where: { companyId } });
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;

  // --- контрагенты ---
  await prisma.counterparty.createMany({
    data: [
      { companyId, name: "Обжарщик CoffeeLab", type: "поставщик" },
      { companyId, name: "Молочная ферма «Айсулу»", type: "поставщик" },
      { companyId, name: "ТОО «Аренда Плюс»", type: "арендодатель" },
      { companyId, name: "Wolt Kazakhstan", type: "партнёр" },
      { companyId, name: "ИП «Праздник»", type: "клиент" },
      { companyId, name: "БЦ «Нурлы Тау»", type: "клиент" },
    ],
  });
  const counterparties = await prisma.counterparty.findMany({ where: { companyId } });
  const cp = (name: string) => counterparties.find((c) => c.name === name)!.id;

  // --- продукты и рецептура ---
  const productIds = new Map<string, string>();
  for (const drink of DRINKS) {
    const product = await prisma.product.create({
      data: {
        companyId,
        name: drink.name,
        unit: drink.unit,
        basePriceMinor: drink.priceMinor,
        costPerUnitMinor: drink.costMinor,
      },
    });
    productIds.set(drink.name, product.id);
    await prisma.productComponent.createMany({
      data: drink.components.map((c) => ({
        companyId,
        productId: product.id,
        name: c.name,
        kind: c.kind,
        quantity: c.quantity,
        unit: c.unit,
        unitCostMinor: c.unitCostMinor,
        percent: c.percent,
      })),
    });
  }
  // без рецептуры — себестоимость только из карточки (показывает оба режима)
  const cheesecake = await prisma.product.create({
    data: { companyId, name: "Чизкейк", unit: "шт", basePriceMinor: t(1800), costPerUnitMinor: t(700) },
  });
  const catering = await prisma.product.create({
    data: { companyId, name: "Кофе-брейк (кейтеринг)", unit: "мероприятие", basePriceMinor: t(150_000), costPerUnitMinor: t(60_000) },
  });

  // --- проекты (кейтеринг) ---
  const project1 = await prisma.project.create({
    data: {
      companyId, projectNumber: "K-2025-01", customerName: "ИП «Праздник»",
      description: "Кофе-брейк на свадьбу, 120 гостей", category: "кейтеринг",
      contractValueMinor: t(350_000), status: "paid",
      orderDate: d(2025, 5, 10), closeDate: d(2025, 5, 21), plannedCostMinor: t(130_000),
    },
  });
  const project2 = await prisma.project.create({
    data: {
      companyId, projectNumber: "K-2025-02", customerName: "БЦ «Нурлы Тау»",
      description: "Конференция, 2 дня, 200 персон", category: "кейтеринг",
      contractValueMinor: t(500_000), status: "paid",
      orderDate: d(2025, 10, 1), closeDate: d(2025, 10, 16), plannedCostMinor: t(190_000),
    },
  });
  const project3 = await prisma.project.create({
    data: {
      companyId, projectNumber: "K-2026-01", customerName: "ИП «Праздник»",
      description: "Корпоратив на Наурыз", category: "кейтеринг",
      contractValueMinor: t(400_000), status: "has_debt",
      orderDate: d(2026, 3, 15), closeDate: d(2026, 3, 22), plannedCostMinor: t(140_000),
      comment: "Клиент оплатил 250 000 ₸, остаток обещали до конца июля",
    },
  });
  const project4 = await prisma.project.create({
    data: {
      companyId, projectNumber: "K-2026-02", customerName: "БЦ «Нурлы Тау»",
      description: "Летний фестиваль во дворе БЦ", category: "кейтеринг",
      contractValueMinor: t(600_000), status: "in_progress",
      orderDate: d(2026, 6, 20), plannedCostMinor: t(220_000),
    },
  });

  // --- операции: январь 2025 — июнь 2026 ---
  type TxnRow = {
    companyId: string; type: "income" | "expense" | "transfer";
    amountMinor: bigint; dateCashflow: Date; periodPnl: Date | null;
    includeInPnl: boolean; categoryId?: string | null;
    accountFromId?: string | null; accountToId?: string | null;
    counterpartyId?: string | null; projectId?: string | null;
    productId?: string | null; quantity?: number | null;
    comment?: string | null; createdBy: string;
  };
  const rows: TxnRow[] = [];
  const income = (r: Omit<TxnRow, "companyId" | "type" | "createdBy" | "includeInPnl">) =>
    rows.push({ companyId, type: "income", includeInPnl: true, createdBy: demoUser.id, ...r });
  const expense = (r: Omit<TxnRow, "companyId" | "type" | "createdBy" | "includeInPnl">) =>
    rows.push({ companyId, type: "expense", includeInPnl: true, createdBy: demoUser.id, ...r });

  const WEEK_DAYS = [7, 14, 21, 28];
  const WEEK_SHARE = [0.24, 0.26, 0.25, 0.25];
  const quarterRevenue = new Map<string, bigint>(); // "2025-Q1" → выручка

  for (let i = 0; i < 18; i++) {
    const y = i < 12 ? 2025 : 2026;
    const m = i < 12 ? i + 1 : i - 11;
    const pnl = d(y, m, 1);
    const factor = SEASON[m - 1] * Math.pow(1.015, i) * (0.95 + 0.1 * rng());

    let monthRevenue = 0n;
    let kaspiIncome = 0n;
    let cashIncome = 0n;

    // продажи напитков и десерта — недельные итоги с продуктом и количеством
    const menu = [...DRINKS, { name: "Чизкейк", priceMinor: t(1800), baseQty: 150 }];
    for (const item of menu) {
      // акция в июне: капучино со скидкой 10 % (факт-цена ниже карточки)
      const promo = item.name === "Капучино" && m === 6;
      const price = promo ? (item.priceMinor * 9n) / 10n : item.priceMinor;
      for (let w = 0; w < 4; w++) {
        const qty = Math.max(1, Math.round(item.baseQty * factor * WEEK_SHARE[w] * (0.9 + 0.2 * rng())));
        const amount = price * BigInt(qty);
        const toCash = w === 3; // одна неделя из четырёх — наличные
        income({
          amountMinor: amount, dateCashflow: d(y, m, WEEK_DAYS[w]), periodPnl: pnl,
          categoryId: cat("Выручка зала"), accountToId: toCash ? cash : kaspi,
          productId: item.name === "Чизкейк" ? cheesecake.id : productIds.get(item.name)!,
          quantity: qty,
          comment: promo ? "Продажи за неделю (акция −10 %)" : "Продажи за неделю",
        });
        monthRevenue += amount;
        if (toCash) cashIncome += amount;
        else kaspiIncome += amount;
      }
    }

    // доставка через Wolt — раз в месяц, без привязки к продукту
    const delivery = (monthRevenue * BigInt(10 + Math.round(4 * rng()))) / 100n;
    income({
      amountMinor: delivery, dateCashflow: d(y, m, 28), periodPnl: pnl,
      categoryId: cat("Доставка"), accountToId: kaspi, counterpartyId: cp("Wolt Kazakhstan"),
      comment: "Выплата Wolt за месяц",
    });
    monthRevenue += delivery;
    kaspiIncome += delivery;

    const qKey = `${y}-Q${Math.ceil(m / 3)}`;
    quarterRevenue.set(qKey, (quarterRevenue.get(qKey) ?? 0n) + monthRevenue);

    // --- расходы месяца ---
    // аренда: за январь 2026 оплачена авансом 28 декабря 2025 (ДДС ≠ ОПУ)
    if (!(y === 2026 && m === 1)) {
      expense({
        amountMinor: t(450_000), dateCashflow: d(y, m, 1), periodPnl: pnl,
        categoryId: cat("Аренда"), accountFromId: halyk, counterpartyId: cp("ТОО «Аренда Плюс»"),
        comment: "Аренда помещения",
      });
    }
    if (y === 2025 && m === 12) {
      expense({
        amountMinor: t(450_000), dateCashflow: d(2025, 12, 28), periodPnl: d(2026, 1, 1),
        categoryId: cat("Аренда"), accountFromId: halyk, counterpartyId: cp("ТОО «Аренда Плюс»"),
        comment: "Аренда за январь 2026 — оплачена авансом (деньги в декабре, расход января)",
      });
    }

    // зарплата за прошлый месяц платится 5-го числа (ещё один пример ДДС ≠ ОПУ)
    if (i > 0) {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      expense({
        amountMinor: py === 2025 ? t(700_000) : t(750_000),
        dateCashflow: d(y, m, 5), periodPnl: d(py, pm, 1),
        categoryId: cat("Зарплата"), accountFromId: halyk,
        comment: `Зарплата команды за ${pm}.${py}`,
      });
    }

    // закуп сырья — привязан к обороту
    const coffee = (monthRevenue * 6n) / 100n;
    for (const day of [8, 22]) {
      expense({
        amountMinor: coffee, dateCashflow: d(y, m, day), periodPnl: pnl,
        categoryId: cat("Продукты и сырьё"), accountFromId: halyk,
        counterpartyId: cp("Обжарщик CoffeeLab"), comment: "Закуп зерна",
      });
    }
    const dairy = (monthRevenue * 2n) / 100n;
    for (const day of [4, 11, 18, 25]) {
      expense({
        amountMinor: dairy, dateCashflow: d(y, m, day), periodPnl: pnl,
        categoryId: cat("Продукты и сырьё"), accountFromId: halyk,
        counterpartyId: cp("Молочная ферма «Айсулу»"), comment: "Молоко и сливки",
      });
    }
    expense({
      amountMinor: (monthRevenue * 3n) / 100n, dateCashflow: d(y, m, 12), periodPnl: pnl,
      categoryId: cat("Упаковка"), accountFromId: kaspi, comment: "Стаканы, крышки, пакеты",
    });

    // коммуналка (зимой дороже), связь, комиссии банка
    const utilities = m <= 2 || m >= 11 ? 95_000 : m >= 5 && m <= 8 ? 60_000 : 75_000;
    expense({
      amountMinor: t(utilities), dateCashflow: d(y, m, 10), periodPnl: pnl,
      categoryId: cat("Коммунальные услуги"), accountFromId: halyk, comment: "Свет, вода, отопление",
    });
    expense({
      amountMinor: t(15_000), dateCashflow: d(y, m, 3), periodPnl: pnl,
      categoryId: cat("Связь и интернет"), accountFromId: kaspi, comment: "Интернет и телефония",
    });
    expense({
      amountMinor: (kaspiIncome * 18n) / 1000n, dateCashflow: d(y, m, 28), periodPnl: pnl,
      categoryId: cat("Банковские комиссии"), accountFromId: kaspi, comment: "Эквайринг Kaspi 1,8 %",
    });

    // маркетинг — не каждый месяц; в ноябре 2025 — большая акция
    if (y === 2025 && m === 11) {
      expense({
        amountMinor: t(300_000), dateCashflow: d(y, m, 15), periodPnl: pnl,
        categoryId: cat("Маркетинг и реклама"), accountFromId: halyk, comment: "Зимняя рекламная кампания",
      });
    } else if (rng() > 0.45) {
      expense({
        amountMinor: t(Math.round((80_000 + 70_000 * rng()) / 1000) * 1000),
        dateCashflow: d(y, m, 15), periodPnl: pnl,
        categoryId: cat("Маркетинг и реклама"), accountFromId: kaspi, comment: "Таргет в Instagram",
      });
    }

    // переводы: инкассация налички в банк (не доход и не расход!)
    rows.push({
      companyId, type: "transfer", includeInPnl: false, createdBy: demoUser.id,
      amountMinor: (cashIncome * 8n) / 10n, dateCashflow: d(y, m, 26), periodPnl: null,
      accountFromId: cash, accountToId: halyk, comment: "Инкассация выручки",
    });
    if (m % 3 === 0) {
      rows.push({
        companyId, type: "transfer", includeInPnl: false, createdBy: demoUser.id,
        amountMinor: t(1_500_000), dateCashflow: d(y, m, 27), periodPnl: null,
        accountFromId: kaspi, accountToId: halyk, comment: "Перевод на расчётный счёт",
      });
    }
  }

  // налог ИП (упрощёнка, 3 % с оборота) — платится после квартала, расход относится к кварталу
  const taxes: Array<{ q: string; pay: Date; pnl: Date }> = [
    { q: "2025-Q1", pay: d(2025, 4, 25), pnl: d(2025, 3, 1) },
    { q: "2025-Q2", pay: d(2025, 7, 25), pnl: d(2025, 6, 1) },
    { q: "2025-Q3", pay: d(2025, 10, 25), pnl: d(2025, 9, 1) },
    { q: "2025-Q4", pay: d(2026, 1, 25), pnl: d(2025, 12, 1) },
    { q: "2026-Q1", pay: d(2026, 4, 25), pnl: d(2026, 3, 1) },
  ];
  for (const tax of taxes) {
    const revenue = quarterRevenue.get(tax.q) ?? 0n;
    expense({
      amountMinor: (revenue * 3n) / 100n, dateCashflow: tax.pay, periodPnl: tax.pnl,
      categoryId: cat("Налоги"), accountFromId: halyk,
      comment: `Налог 3 % за ${tax.q.replace("-", " ")}`,
    });
  }

  // капзатраты
  expense({
    amountMinor: t(2_500_000), dateCashflow: d(2025, 3, 15), periodPnl: d(2025, 3, 1),
    categoryId: cat("Оборудование (капзатраты)"), accountFromId: halyk,
    comment: "Эспрессо-машина La Marzocco (б/у)",
  });
  expense({
    amountMinor: t(450_000), dateCashflow: d(2026, 2, 10), periodPnl: d(2026, 2, 1),
    categoryId: cat("Оборудование (капзатраты)"), accountFromId: halyk,
    comment: "Кофемолка Mahlkönig",
  });

  // проекты: оплаты и расходы
  income({
    amountMinor: t(350_000), dateCashflow: d(2025, 5, 21), periodPnl: d(2025, 5, 1),
    categoryId: cat("Кейтеринг и мероприятия"), accountToId: halyk,
    counterpartyId: cp("ИП «Праздник»"), projectId: project1.id,
    productId: catering.id, quantity: 2, comment: "Оплата по договору",
  });
  expense({
    amountMinor: t(120_000), dateCashflow: d(2025, 5, 18), periodPnl: d(2025, 5, 1),
    categoryId: cat("Продукты и сырьё"), accountFromId: halyk, projectId: project1.id,
    comment: "Закуп под мероприятие",
  });
  income({
    amountMinor: t(500_000), dateCashflow: d(2025, 10, 17), periodPnl: d(2025, 10, 1),
    categoryId: cat("Кейтеринг и мероприятия"), accountToId: halyk,
    counterpartyId: cp("БЦ «Нурлы Тау»"), projectId: project2.id,
    productId: catering.id, quantity: 3, comment: "Оплата по договору",
  });
  expense({
    amountMinor: t(180_000), dateCashflow: d(2025, 10, 14), periodPnl: d(2025, 10, 1),
    categoryId: cat("Продукты и сырьё"), accountFromId: halyk, projectId: project2.id,
    comment: "Закуп под конференцию",
  });
  // проект с долгом: получили 250 из 400 тысяч
  income({
    amountMinor: t(250_000), dateCashflow: d(2026, 3, 22), periodPnl: d(2026, 3, 1),
    categoryId: cat("Кейтеринг и мероприятия"), accountToId: halyk,
    counterpartyId: cp("ИП «Праздник»"), projectId: project3.id,
    productId: catering.id, quantity: 2, comment: "Частичная оплата (долг 150 000 ₸)",
  });
  expense({
    amountMinor: t(130_000), dateCashflow: d(2026, 3, 19), periodPnl: d(2026, 3, 1),
    categoryId: cat("Продукты и сырьё"), accountFromId: halyk, projectId: project3.id,
    comment: "Закуп под корпоратив",
  });
  // проект в работе: предоплата
  income({
    amountMinor: t(200_000), dateCashflow: d(2026, 6, 25), periodPnl: d(2026, 6, 1),
    categoryId: cat("Кейтеринг и мероприятия"), accountToId: halyk,
    counterpartyId: cp("БЦ «Нурлы Тау»"), projectId: project4.id,
    productId: catering.id, quantity: 1, comment: "Предоплата 1/3",
  });
  expense({
    amountMinor: t(90_000), dateCashflow: d(2026, 6, 28), periodPnl: d(2026, 6, 1),
    categoryId: cat("Продукты и сырьё"), accountFromId: halyk, projectId: project4.id,
    comment: "Закуп к фестивалю",
  });

  await prisma.transaction.createMany({ data: rows });

  // --- планы на 2026 (продажи с сезонностью + расходы) ---
  const salesPlanRows = [];
  for (let m = 1; m <= 12; m++) {
    for (const item of [...DRINKS, { name: "Чизкейк", priceMinor: t(1800), baseQty: 150 }]) {
      salesPlanRows.push({
        companyId,
        productId: item.name === "Чизкейк" ? cheesecake.id : productIds.get(item.name)!,
        month: d(2026, m, 1),
        plannedPriceMinor: item.priceMinor,
        plannedQuantity: Math.round(item.baseQty * 1.2 * SEASON[m - 1]),
        growthRate: 0.015,
        seasonalityFactor: SEASON[m - 1],
      });
    }
  }
  await prisma.salesPlan.createMany({ data: salesPlanRows });

  const expensePlanRows = [];
  for (let m = 1; m <= 12; m++) {
    const month = d(2026, m, 1);
    expensePlanRows.push(
      { companyId, month, expenseType: "fixed" as const, amountMinor: t(450_000), categoryId: cat("Аренда"), percentOfRevenue: null, comment: null },
      { companyId, month, expenseType: "payroll" as const, amountMinor: t(750_000), categoryId: cat("Зарплата"), percentOfRevenue: null, comment: null },
      { companyId, month, expenseType: "fixed" as const, amountMinor: t(75_000), categoryId: cat("Коммунальные услуги"), percentOfRevenue: null, comment: null },
      { companyId, month, expenseType: "fixed" as const, amountMinor: t(100_000), categoryId: cat("Маркетинг и реклама"), percentOfRevenue: null, comment: null },
      { companyId, month, expenseType: "percent_of_revenue" as const, amountMinor: null, categoryId: cat("Продукты и сырьё"), percentOfRevenue: 0.2, comment: "Сырьё ≈ 20 % оборота" },
      { companyId, month, expenseType: "percent_of_revenue" as const, amountMinor: null, categoryId: cat("Упаковка"), percentOfRevenue: 0.03, comment: null },
      { companyId, month, expenseType: "tax" as const, amountMinor: null, categoryId: cat("Налоги"), percentOfRevenue: 0.03, comment: "ИП упрощёнка" }
    );
  }
  await prisma.expensePlan.createMany({ data: expensePlanRows });

  // --- инвестиционный сценарий: вторая точка ---
  const invest = await prisma.investmentModel.create({
    data: {
      companyId, name: "Вторая точка — ТРЦ", startMonth: d(2026, 9, 1),
      horizonMonths: 24, valuationMethod: "manual",
      companyValuationMinor: t(40_000_000), investmentAmountMinor: t(12_000_000),
      dividendPolicyPercent: 0.5, investorShare: 0.25,
    },
  });
  await prisma.investmentItem.createMany({
    data: [
      { companyId, investmentModelId: invest.id, section: "capex", itemName: "Ремонт помещения", monthlyCostMinor: t(4_500_000), monthsCount: 1, totalCostMinor: t(4_500_000) },
      { companyId, investmentModelId: invest.id, section: "capex", itemName: "Оборудование бара", monthlyCostMinor: t(3_500_000), monthsCount: 1, totalCostMinor: t(3_500_000) },
      { companyId, investmentModelId: invest.id, section: "launch", itemName: "Маркетинг открытия", monthlyCostMinor: t(800_000), monthsCount: 1, totalCostMinor: t(800_000) },
      { companyId, investmentModelId: invest.id, section: "launch", itemName: "Найм и обучение персонала", monthlyCostMinor: t(400_000), monthsCount: 1, totalCostMinor: t(400_000) },
      { companyId, investmentModelId: invest.id, section: "operating_buffer", itemName: "Подушка на первые месяцы", monthlyCostMinor: t(700_000), monthsCount: 3, totalCostMinor: t(2_100_000) },
      { companyId, investmentModelId: invest.id, section: "reserve", itemName: "Непредвиденные расходы", monthlyCostMinor: t(700_000), monthsCount: 1, totalCostMinor: t(700_000) },
    ],
  });

  // --- комментарий консультанта и клиентская ссылка ---
  await prisma.dashboardConfig.create({
    data: {
      companyId, name: "default", createdBy: consultant.id,
      configJson: {
        consultantComment:
          "Маржа стабильно выше 60 %, но летом выручка проседает на четверть. Рекомендую к июню сформировать денежный резерв и запустить летнее меню (холодные напитки).",
        brandLine: "Отчёт подготовлен: Демо-консультант · FinSystem",
      },
    },
  });
  await prisma.shareLink.create({
    data: {
      companyId, token: DEMO_SHARE_TOKEN, role: "viewer",
      canEditInputs: false, createdBy: demoUser.id, expiresAt: null,
    },
  });

  // --- закрытые месяцы: январь и февраль 2025 (со снимками отчётов) ---
  const { txns, accounts: calcAccounts } = await loadCalcData(companyId);
  for (const m of [1, 2]) {
    const period = monthStart(2025, m);
    const end = monthEnd(2025, m);
    const cf = cashflowSummary(txns, calcAccounts, period, end);
    const pnl = pnlForMonth(txns, period);
    await prisma.reportSnapshot.create({
      data: {
        companyId, period, isClosed: true,
        revenueMinor: pnl.revenueMinor,
        expensesMinor: pnl.revenueMinor - pnl.netProfitMinor,
        netProfitMinor: pnl.netProfitMinor,
        cashInMinor: cf.cashInMinor,
        cashOutMinor: cf.cashOutMinor,
        openingBalanceMinor: cf.openingMinor,
        closingBalanceMinor: cf.closingMinor,
      },
    });
  }

  return companyId;
}
