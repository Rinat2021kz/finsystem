"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});
  return (
    <form action={action}>
      {state.error && <div className="alert error">{state.error}</div>}
      <label className="field">
        E-mail
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Пароль
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
