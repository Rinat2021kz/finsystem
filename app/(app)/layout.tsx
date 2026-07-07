import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenancy";
import { signOut } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireTenant();
  const [company, user] = await Promise.all([
    prisma.company.findUnique({ where: { id: tenant.companyId } }),
    prisma.user.findUnique({ where: { id: tenant.userId } }),
  ]);
  if (!company) redirect("/onboarding");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          ФинУчёт
          <small>{company.name}</small>
        </div>
        <Link href="/dashboard">Дашборд</Link>
        <Link href="/transactions">Операции</Link>
        <div className="section">Отчёты</div>
        <Link href="/reports/cashflow">ДДС</Link>
        <Link href="/reports/pnl">ОПУ</Link>
        <Link href="/reports/balance">Баланс денег</Link>
        <div className="section">Справочники</div>
        <Link href="/settings/accounts">Счета</Link>
        <Link href="/settings/categories">Категории</Link>
        <Link href="/settings/counterparties">Контрагенты</Link>
        <div className="spacer" />
        <div className="user">
          {user?.name}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="secondary" style={{ marginTop: 8, width: "100%" }}>
              Выйти
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
