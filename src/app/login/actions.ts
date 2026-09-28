"use server";

import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent: boolean; error?: string };

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { sent: false, error: "Adresse e-mail invalide." };
  // Same answer for any address: don't reveal who the owner is.
  if (email !== process.env.OWNER_EMAIL?.toLowerCase()) return { sent: true };

  const db = await createClient();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`, shouldCreateUser: true },
  });
  if (error) return { sent: false, error: "Envoi impossible, réessaie dans une minute." };
  return { sent: true };
}
