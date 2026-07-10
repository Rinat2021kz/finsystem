"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { COMPANY_COOKIE } from "@/lib/tenancy";
import { DEMO_EMAIL, DEMO_PASSWORD, ensureDemoCompany } from "@/lib/demo";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя"),
  email: z.string().trim().toLowerCase().email("Некорректный e-mail"),
  password: z.string().min(6, "Пароль — минимум 6 символов"),
});

export interface AuthFormState {
  error?: string;
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте данные формы" };
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // приглашённый участник без пароля завершает регистрацию на тот же e-mail
    if (existing.status === "invited" && !existing.passwordHash) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name, passwordHash: await hash(password, 10), status: "active" },
      });
      await signIn("credentials", { email, password, redirect: false });
      redirect("/dashboard");
    }
    return { error: "Пользователь с таким e-mail уже зарегистрирован" };
  }

  await prisma.user.create({
    data: { name, email, passwordHash: await hash(password, 10) },
  });

  await signIn("credentials", { email, password, redirect: false });
  redirect("/onboarding");
}

/** Вход в демо-режим: при первом запуске создаёт демо-компанию с данными. */
export async function demoLoginAction(): Promise<void> {
  const companyId = await ensureDemoCompany();
  await signIn("credentials", { email: DEMO_EMAIL, password: DEMO_PASSWORD, redirect: false });
  const cookieStore = await cookies();
  cookieStore.set(COMPANY_COOKIE, companyId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Неверный e-mail или пароль" };
    throw e;
  }
  redirect("/dashboard");
}
