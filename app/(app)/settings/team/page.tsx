import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatDateRu } from "@/lib/period";
import {
  createShareLinkAction,
  inviteMemberAction,
  removeMemberAction,
  revokeShareLinkAction,
  saveBrandAction,
} from "./actions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  consultant: "Консультант",
  accountant: "Бухгалтер",
  manager: "Менеджер",
  viewer: "Наблюдатель",
  investor: "Инвестор",
};

export default async function TeamPage() {
  const tenant = await requireTenant();
  const admin = isAdmin(tenant.role);

  const [members, links, headerList, dashboardConfig] = await Promise.all([
    prisma.companyMember.findMany({
      where: { companyId: tenant.companyId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.shareLink.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { createdAt: "desc" },
    }),
    headers(),
    prisma.dashboardConfig.findFirst({
      where: { companyId: tenant.companyId, name: "default" },
    }),
  ]);
  const brandLine =
    dashboardConfig &&
    typeof dashboardConfig.configJson === "object" &&
    dashboardConfig.configJson !== null
      ? String((dashboardConfig.configJson as Record<string, unknown>).brandLine ?? "")
      : "";

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : "";

  return (
    <>
      <h1>Команда и доступ</h1>
      <p className="page-sub">
        Участники компании, приглашение консультанта и ссылки для клиента без регистрации
      </p>

      <h2>Участники</h2>
      {admin && (
        <form action={inviteMemberAction} className="panel">
          <div className="form-grid">
            <label className="field">
              E-mail
              <input name="email" type="email" required placeholder="consultant@mail.kz" />
            </label>
            <label className="field">
              Роль
              <select name="role" defaultValue="consultant">
                <option value="consultant">Консультант</option>
                <option value="accountant">Бухгалтер</option>
                <option value="manager">Менеджер</option>
                <option value="viewer">Наблюдатель</option>
              </select>
            </label>
            <button type="submit">Пригласить</button>
          </div>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
            Если у приглашённого ещё нет аккаунта — он зарегистрируется на этот e-mail и сразу
            увидит компанию. Консультант может вести несколько компаний под одним аккаунтом.
          </p>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>E-mail</th>
              <th>Роль</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.name}</td>
                <td className="muted">{m.user.email}</td>
                <td>
                  <span className={`badge ${m.role === "owner" ? "green" : "gray"}`}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </td>
                <td className="muted">
                  {m.user.status === "invited" ? "приглашён, ждёт регистрации" : "активен"}
                </td>
                {admin && (
                  <td>
                    {m.role !== "owner" && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button type="submit" className="secondary">
                          Убрать
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Клиентские ссылки</h2>
      <p className="steps">
        Ссылка открывает дашборд компании в режиме просмотра — без регистрации и пароля.
        Подходит, чтобы показать цифры собственнику или инвестору.
      </p>
      {admin && (
        <form action={createShareLinkAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Срок действия, дней (0 — бессрочно)
              <input name="expiresDays" type="number" min={0} max={365} defaultValue={30} />
            </label>
            <button type="submit">Создать ссылку</button>
          </div>
        </form>
      )}
      {admin && (
        <form action={saveBrandAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Подпись на клиентских ссылках (white-label: имя консультанта или бренд)
              <input
                name="brandLine"
                defaultValue={brandLine}
                maxLength={200}
                placeholder="Например: Финансовый консультант Ринат Гасимов"
              />
            </label>
            <button type="submit" className="secondary">
              Сохранить подпись
            </button>
          </div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ссылка</th>
              <th>Создана</th>
              <th>Действует до</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {links.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Ссылок пока нет
                </td>
              </tr>
            )}
            {links.map((l) => (
              <tr key={l.id}>
                <td style={{ minWidth: 320 }}>
                  <input
                    readOnly
                    value={`${baseUrl}/share/${l.token}`}
                    style={{ width: "100%", fontSize: "0.8rem" }}
                  />
                  <a href={`/share/${l.token}`} target="_blank" style={{ fontSize: "0.8rem" }}>
                    Открыть →
                  </a>
                </td>
                <td className="muted">{formatDateRu(l.createdAt)}</td>
                <td className="muted">
                  {l.expiresAt ? formatDateRu(l.expiresAt) : "бессрочно"}
                </td>
                {admin && (
                  <td>
                    <form action={revokeShareLinkAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="secondary">
                        Отозвать
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
