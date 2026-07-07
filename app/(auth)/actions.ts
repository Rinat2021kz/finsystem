"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";

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
  if (existing) return { error: "Пользователь с таким e-mail уже зарегистрирован" };

  await prisma.user.create({
    data: { name, email, passwordHash: await hash(password, 10) },
  });

  await signIn("credentials", { email, password, redirect: false });
  redirect("/onboarding");
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
