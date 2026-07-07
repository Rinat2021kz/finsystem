import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { RegisterForm } from "./form";

export default async function RegisterPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Регистрация</h1>
        <p className="sub">Создайте аккаунт владельца — компанию настроим на следующем шаге.</p>
        <RegisterForm />
        <p className="auth-footer">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
