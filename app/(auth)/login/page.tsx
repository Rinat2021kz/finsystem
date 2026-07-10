import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { demoLoginAction } from "../actions";
import { LoginForm } from "./form";

// первый вход в демо наполняет БД примерами — даём серверу время
export const maxDuration = 60;

export default async function LoginPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>ФинУчёт</h1>
        <p className="sub">Управленческий учёт для малого бизнеса. Войдите в аккаунт.</p>
        <LoginForm />
        <p className="auth-footer">
          Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
        </p>
        <form action={demoLoginAction} style={{ marginTop: 14 }}>
          <button type="submit" className="secondary" style={{ width: "100%" }}>
            Посмотреть демо-кофейню
          </button>
          <p className="sub" style={{ marginTop: 8, fontSize: "0.82rem" }}>
            Готовый пример: кофейня с операциями за 2025–2026 гг., проектами, планами и
            инвестсценарием. Данные можно менять — и в любой момент сбросить к исходным.
          </p>
        </form>
      </div>
    </div>
  );
}
