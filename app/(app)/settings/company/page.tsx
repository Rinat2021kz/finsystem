import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { updateCompanyModulesAction } from "../actions";

/** Модули компании — то, что раньше выбиралось только в онбординге и потом не менялось. */
export default async function CompanySettingsPage() {
  const tenant = await requireTenant();
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId } });
  if (!company) redirect("/onboarding");
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Настройки компании</h1>
      <p className="page-sub">{company.name}</p>

      <div className="alert info">
        Модули можно включать и выключать в любой момент — данные при выключении не удаляются,
        раздел просто пропадает из меню. Включайте только то, чем действительно пользуетесь:
        лишние разделы усложняют работу.
      </div>

      <form action={updateCompanyModulesAction} className="panel">
        <h2 style={{ marginTop: 0 }}>Модули</h2>

        <label className="check">
          <input
            type="checkbox"
            name="projectsEnabled"
            defaultChecked={company.projectsEnabled}
            disabled={!admin}
          />{" "}
          <strong>Проекты и заказы</strong>
          <br />
          <span className="muted">
            Если работа идёт заказами: отдельная прибыль и долг по каждому заказу.
          </span>
        </label>

        <label className="check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            name="investmentsEnabled"
            defaultChecked={company.investmentsEnabled}
            disabled={!admin}
          />{" "}
          <strong>Инвестиционный модуль</strong>
          <br />
          <span className="muted">
            Расчёт вложений, окупаемости и доли инвестора для нового направления.
          </span>
        </label>

        <label className="check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            name="stockEnabled"
            defaultChecked={company.stockEnabled}
            disabled={!admin}
          />{" "}
          <strong>Складской учёт</strong>
          <br />
          <span className="muted">
            Если вы торгуете товаром или расходуете материалы: остатки по складам и точкам,
            себестоимость по партиям закупки, списание материалов на заказ. Себестоимость товара
            попадает в ОПУ в момент продажи, а не в момент закупки — расходы перестают «прыгать»
            в тот месяц, когда вы закупились впрок.
          </span>
        </label>

        {admin && (
          <button type="submit" style={{ marginTop: 16 }}>
            Сохранить
          </button>
        )}
        {!admin && (
          <p className="muted" style={{ marginTop: 16 }}>
            Менять модули может владелец или консультант.
          </p>
        )}
      </form>

      {company.stockEnabled && (
        <p className="muted">
          Следующий шаг — завести склады и точки в{" "}
          <Link href="/settings/warehouses">справочнике складов</Link> и отметить в{" "}
          <Link href="/settings/products">продуктах</Link>, по каким из них вести остатки.
        </p>
      )}
    </>
  );
}
