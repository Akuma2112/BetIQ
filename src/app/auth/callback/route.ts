import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Magic-link landing: exchange the code, register the owner on first login. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const home = new URL("/today", request.url);
  const login = new URL("/login", request.url);
  if (!code) return NextResponse.redirect(login);

  const db = await createClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  const user = data.user;
  if (error || !user || user.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    await db.auth.signOut();
    return NextResponse.redirect(login);
  }
  // First login: bind this auth user as the single owner (RLS keys off app_owner).
  await createAdminClient().from("app_owner").upsert({ id: 1, user_id: user.id }, { onConflict: "id", ignoreDuplicates: true });
  return NextResponse.redirect(home);
}
