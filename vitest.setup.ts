import { config } from "dotenv";

/**
 * Vitest does not read `.env`, so anything needing DATABASE_URL would silently skip.
 * `quiet` because a dotenv banner on every run is noise, and the tests themselves report
 * clearly enough whether they had a database to talk to.
 */
config({ quiet: true });

/**
 * Point every database-touching test at the Neon TEST BRANCH when one is configured.
 *
 * `.env.test` holds `TEST_DATABASE_URL` and is gitignored. When it is present the whole test
 * process is redirected onto it, which matters more than it sounds: until now the concurrency
 * and audit-log tests ran against **production**, creating and deleting rows in the live shop.
 * They cleaned up after themselves, but "careful about it" is not the same as "cannot touch
 * it", and only one of those is a property you can rely on at 2am.
 *
 * Overriding here rather than in each test is deliberate — `lib/prisma` reads `DATABASE_URL`
 * at import time, and a per-test override would race whichever file imported it first.
 */
const testUrl = readTestDatabaseUrl();

/**
 * Never send real email from a test.
 *
 * `completeCheckout` sends the order confirmation inline (services/checkout.ts), so a test
 * that places an order would put a genuine message through Resend — to a real address, from
 * the real shop, counting against the real quota. The `dev` provider writes the same EmailLog
 * row and sends nothing, so the assertion "a confirmation was queued" still works.
 *
 * Set unconditionally, not only when a test branch exists: the cost of getting this wrong is
 * mail landing in a customer's inbox, and no test is worth that risk.
 */
process.env.EMAIL_PROVIDER = "dev";

if (testUrl) {
  assertNotProduction(testUrl);
  process.env.DATABASE_URL = testUrl;
  // Migrations use the direct endpoint; nothing in the tests migrates, but leaving this
  // pointed at production would be a loaded gun in the drawer.
  process.env.DIRECT_URL = testUrl.replace("-pooler.", ".");
  console.info(`[tests] database: ${describeEndpoint(testUrl)} (test branch) · email: dev (nothing sent)`);
} else if (process.env.ALLOW_PRODUCTION_DB_TESTS === "1") {
  console.warn("[tests] ALLOW_PRODUCTION_DB_TESTS=1 — database tests will run against DATABASE_URL.");
} else {
  // Without a test database the DB suites SKIP instead of running against whatever `.env`
  // points at — which, on this project, is the live shop. They clean up after themselves,
  // but "creates and deletes orders in production on every `npm test`" is not a default.
  for (const key of ["DATABASE_URL", "DIRECT_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"]) delete process.env[key];
  console.warn(
    "[tests] TEST_DATABASE_URL is not set — database tests are skipped. Put a test database's\n" +
      "        connection string in .env.test (TEST_DATABASE_URL=...) to run them."
  );
}

function readTestDatabaseUrl(): string | null {
  // Loaded separately from `.env` so it wins, and so its absence is not an error.
  const parsed = config({ path: ".env.test", quiet: true, override: false });
  return parsed.parsed?.TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? null;
}

/** `ep-noisy-tree-asjlvmdj` from a full connection string — never the credentials. */
function describeEndpoint(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");
  } catch {
    return "unparseable";
  }
}

/**
 * The guard that makes the rest of this safe.
 *
 * Tests that place real orders and move real stock are only acceptable because they cannot
 * reach the live shop. A copy-pasted production string in `.env.test` would quietly undo that,
 * and the failure would be invisible until it had already written. So it fails loudly and
 * refuses to run instead.
 */
function assertNotProduction(testUrl: string): void {
  const production = process.env.DATABASE_URL;
  if (!production) return;

  if (describeEndpoint(testUrl) === describeEndpoint(production)) {
    throw new Error(
      "TEST_DATABASE_URL points at the SAME Neon endpoint as DATABASE_URL.\n" +
        "Refusing to run: these tests write real orders and decrement real stock.\n" +
        "Create a branch in the Neon console and use that branch's connection string."
    );
  }
}
