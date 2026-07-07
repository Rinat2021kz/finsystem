import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OnboardingForm } from "./form";
import { INDUSTRY_TEMPLATES } from "@/lib/templates";

export default async function OnboardingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const membership = await prisma.companyMember.findFirst({ where: { userId } });
  if (membership) redirect("/dashboard");

  const templates = INDUSTRY_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    accounts: t.accounts.map((a) => a.name),
  }));

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 560 }}>
        <h1>Настройка компании</h1>
        <p className="sub">
          Пара шагов — и система готова: создадим счета и статьи доходов/расходов под вашу отрасль.
          Всё можно поменять позже в справочниках.
        </p>
        <OnboardingForm templates={templates} />
      </div>
    </div>
  );
}
