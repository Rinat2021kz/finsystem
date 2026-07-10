import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import {
  createCategoryAction,
  deleteCategoryAction,
  toggleCategoryAction,
  updateCategoryAction,
} from "../actions";

const GROUP_LABELS: Record<string, string> = {
  revenue: "Выручка",
  variable: "Переменные",
  fixed: "Постоянные",
  payroll: "ФОТ",
  tax: "Налоги",
  interest: "Проценты",
  depreciation: "Амортизация",
  other: "Прочее",
};

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const categories = await prisma.category.findMany({
    where: { companyId: tenant.companyId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { parent: true },
  });
  const admin = isAdmin(tenant.role);

  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  return (
    <>
      <h1>Категории</h1>
      <p className="page-sub">
        Статьи доходов и расходов. Группа определяет строку в отчёте о прибылях и убытках.
      </p>

      {params.error === "inuse" && (
        <div className="alert error">
          Категорию нельзя удалить: на неё записаны операции, планы или подкатегории. Скройте её —
          она исчезнет из форм, но останется в истории и отчётах.
        </div>
      )}

      {admin && (
        <form action={createCategoryAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Название
              <input name="name" required placeholder="Например: Доставка" />
            </label>
            <label className="field">
              Тип
              <select name="type" defaultValue="expense">
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
              </select>
            </label>
            <label className="field">
              Группа в ОПУ (для расходов)
              <select name="pnlGroup" defaultValue="fixed">
                {Object.entries(GROUP_LABELS)
                  .filter(([v]) => v !== "revenue")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Родительская категория
              <select name="parentId" defaultValue="">
                <option value="">— (верхний уровень)</option>
                {categories
                  .filter((c) => !c.parentId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
              <input type="checkbox" name="isCapex" /> Капитальные затраты
            </label>
            <button type="submit">Добавить категорию</button>
          </div>
        </form>
      )}

      {[
        { title: "Доходы", list: income },
        { title: "Расходы", list: expense },
      ].map(({ title, list }) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Группа в ОПУ</th>
                  <th>Признаки</th>
                  <th>Статус</th>
                  {admin && <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const formId = `cat-${c.id}`;
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.parent ? <span className="muted">{c.parent.name} / </span> : null}
                        {admin ? (
                          <input name="name" form={formId} defaultValue={c.name} style={{ width: 200 }} />
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className="muted">
                        {admin && c.type === "expense" ? (
                          <select name="pnlGroup" form={formId} defaultValue={c.pnlGroup}>
                            {Object.entries(GROUP_LABELS)
                              .filter(([v]) => v !== "revenue")
                              .map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        ) : (
                          (GROUP_LABELS[c.pnlGroup] ?? c.pnlGroup)
                        )}
                      </td>
                      <td className="muted">
                        {admin && c.type === "expense" ? (
                          <label style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                            <input
                              type="checkbox"
                              name="isCapex"
                              form={formId}
                              defaultChecked={c.isCapex}
                            />{" "}
                            капзатраты
                          </label>
                        ) : c.isCapex ? (
                          "капзатраты"
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        <span className={`badge ${c.isActive ? "green" : "gray"}`}>
                          {c.isActive ? "Активна" : "Скрыта"}
                        </span>
                      </td>
                      {admin && (
                        <td style={{ whiteSpace: "nowrap" }}>
                          <form id={formId} action={updateCategoryAction} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="secondary" title="Сохранить изменения">
                              💾
                            </button>
                          </form>{" "}
                          <form action={toggleCategoryAction} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="secondary">
                              {c.isActive ? "Скрыть" : "Вернуть"}
                            </button>
                          </form>{" "}
                          <form action={deleteCategoryAction} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="secondary"
                              title="Удалить (если нет операций и планов)"
                            >
                              ✕
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
