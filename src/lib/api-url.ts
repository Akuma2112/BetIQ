export function getBaseUrl(): string {
  // Vercel automatically injects VERCEL_URL (no protocol)
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Local development
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
