import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { LoginForm } from "./form";

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
      </div>
    </div>
  );
}
