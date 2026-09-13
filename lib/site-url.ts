import "server-only";

/**
 * Absolute site URL for every link inside an email. Deliberately NOT derived from
 * `request.url`: a sign-up through a preview deployment or the bare *.vercel.app alias
 * would otherwise mail out links to that host, and a webhook or cron job has no request
 * at all. NEXT_PUBLIC_SITE_URL is the production domain; the Vercel fallbacks cover an
 * environment where it was never set.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
