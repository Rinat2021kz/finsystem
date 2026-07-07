"use client";

import { useActionState } from "react";
import { registerAction, type AuthFormState } from "../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  return (
    <form action={action}>
      {state.error && <div className="alert error">{state.error}</div>}
      <label className="field">
        Имя
        <input name="name" required autoComplete="name" />
      </label>
      <label className="field">
        E-mail
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Пароль
        <input name="password" type="password" required minLength={6} autoComplete="new-password" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Создаём…" : "Создать аккаунт"}
      </button>
    </form>
  );
}
