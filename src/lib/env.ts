import { z } from "zod";

/** Server-side env, validated lazily so a missing optional key only fails the feature that needs it. */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  OWNER_EMAIL: z.email(),
  FOOTBALL_DATA_ORG_TOKEN: z.string().min(1),
  ODDS_API_KEY: z.string().min(1),
  ODDS_API_MONTHLY_CREDITS: z.coerce.number().int().positive().default(500),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type Env = z.infer<typeof schema>;

export function env<K extends keyof Env>(key: K): Env[K] {
  const parsed = schema.shape[key].safeParse(process.env[key]);
  if (!parsed.success) throw new Error(`Missing or invalid env var ${key}`);
  return parsed.data as Env[K];
}
