import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** RLS-scoped client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes the session.
        }
      },
    },
  });
}

/** Returns the client for the signed-in owner, or redirects to /login. */
export async function requireOwner() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || user.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) redirect("/login");
  return { db, user };
}
