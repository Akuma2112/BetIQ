"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { sent: false });
  if (state.sent) return <p className="max-w-xs text-center text-sm">Si cette adresse est autorisée, un lien de connexion vient d’être envoyé.</p>;
  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-3">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="e-mail"
        className="rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-gold"
      />
      <button disabled={pending} className="rounded-md bg-gold py-2.5 font-medium text-bg disabled:opacity-50">
        {pending ? "Envoi…" : "Recevoir le lien"}
      </button>
      {state.error && <p className="text-sm text-loss">{state.error}</p>}
    </form>
  );
}
