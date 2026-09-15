import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/auth";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { hasValidMaintenancePass, isMaintenanceModeOn, MAINTENANCE_PASS_COOKIE } from "@/services/maintenance";
import legacyRedirects from "@/data/legacy-redirects.json";

/**
 * A real HTTP 404, for the same reason the redirects below live here (`SEO-002`).
 *
 * A catalogue page cannot produce one itself any more. Since Cache Components was enabled the
 * routes are served from a prerendered shell, and Next's own guide is explicit: "Once streaming
 * begins, the HTTP response headers (including the status code) have already been sent […] If a
 * `notFound()` fires mid-stream, Next.js cannot go back and change the status to 404." The
 * `notFound()` calls in those pages still run and still render the right page — they just arrive
 * after the 200 has gone out. The proxy runs before any of that, so it can still set a status.
 *
 * Rewritten to `/_not-found` rather than returning a bare body, so a human still gets the shop's
 * own 404 page — header, footer, Greek copy — instead of a blank wall of text. The status is set
 * on the rewrite, which is what makes this a hard 404 rather than the soft one it replaces.
 */
function notFoundResponse(request: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

/**
 * Renamed category URLs are redirected HERE rather than in the page, and it has to be here.
 * `/category/[slug]` streams, and Next emits a client-side `<meta http-equiv="refresh">`
 * instead of a 308 when `permanentRedirect` is called in a streaming context — a soft
 * redirect, which defeats the purpose of preserving the old URL's ranking. The proxy runs
 * before any response begins, so it can return a real 308. (Proxy is Node runtime by
 * default in Next 16, so Prisma is available here.)
 *
 * Costs one indexed lookup on category pageviews. The common case — a slug that was never
 * renamed — is a single index miss.
 */
async function renamedCategoryRedirect(request: NextRequest): Promise<NextResponse | null> {
  const slug = request.nextUrl.pathname.split("/")[2];
  if (!slug) return null;

  // A live category always wins, so a slug that was retired and later reissued serves the
  // new category instead of redirecting away from it.
  const live = await prisma.category.findUnique({ where: { slug }, select: { isVisible: true } });
  // The page's own rule is `!rawCategory || !rawCategory.isVisible` → notFound(), which it can no
  // longer back with a status. Same rule, applied where a status can still be set.
  if (live) return live.isVisible ? null : notFoundResponse(request);

  const history = await prisma.categorySlugHistory.findUnique({
    where: { slug },
    select: { category: { select: { slug: true, isVisible: true } } },
  });
  // Not live and not a usable rename: the slug does not exist, so say so with a status rather
  // than letting the page render a 200 it can no longer take back. Costs nothing extra — the
  // two lookups above have already established it.
  if (!history || !history.category.isVisible || history.category.slug === slug) {
    return notFoundResponse(request);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/category/${history.category.slug}`;
  return NextResponse.redirect(url, 308);
}

/**
 * The same treatment for products, and for the same reasons — `/products/[slug]` streams
 * too, so a `permanentRedirect` inside the page degrades to a client-side meta refresh
 * rather than a 308, which is a soft redirect and passes no ranking on.
 *
 * A product URL is the most linked-to page a shop has, and the slug is an editable field
 * on the admin form, so this is the redirect that matters most.
 */
async function renamedProductRedirect(request: NextRequest): Promise<NextResponse | null> {
  const slug = request.nextUrl.pathname.split("/")[2];
  if (!slug) return null;

  // A live product always wins — a retired slug later reissued to a different product
  // serves that product rather than redirecting away from it. Checked without filtering on
  // status: a draft occupying the slug still owns it, and should 404 rather than redirect
  // a customer to some other product that once had the name.
  const live = await prisma.product.findUnique({ where: { slug }, select: { status: true } });
  // `PUBLISHED` in services/products.ts is `status: "active"`, so anything else is invisible to
  // a customer and the page would 404 on it — softly, now that it cannot set a status. Mirroring
  // the rule here turns that into a real one, and keeps the two definitions of "visible" in step.
  if (live) return live.status === "active" ? null : notFoundResponse(request);

  const history = await prisma.productSlugHistory.findUnique({
    where: { slug },
    select: { product: { select: { slug: true, status: true } } },
  });
  // As above: no live product and no active rename means the URL is not a product. Note this
  // cannot swallow a draft — a draft occupying the slug is found by the `live` lookup above,
  // which deliberately does not filter on status, and is left to the page to handle.
  if (!history || history.product.status !== "active" || history.product.slug === slug) {
    return notFoundResponse(request);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/products/${history.product.slug}`;
  return NextResponse.redirect(url, 308);
}

/**
 * Collections get the 404 but not the redirect, because there is no `collectionSlugHistory` to
 * redirect through — a collection slug has never been tracked across renames. Existence is the
 * whole rule here, matching `getCollectionBySlug`, which does a bare `findUnique` with no
 * visibility filter of its own.
 *
 * Unlike the two above, this lookup is *added* cost rather than reused: one indexed hit per
 * collection pageview, which is the price of the route being able to answer 404 at all.
 */
/**
 * Collections that have been retired in favour of a category, sent on with a 308.
 *
 * A hand-written map rather than a table, because this is a short list that shrinks: each entry
 * is a collection that turned out to be a category wearing a different name, and the redirect
 * exists so the old URL keeps whatever ranking and inbound links it had. When the list is
 * empty, delete this.
 *
 * `woman-sneakers-collection` was not merely a duplicate — it was **wrong**. Named for women
 * and titled "Η Συλλογή Σνίκερ", it held 19 men's sneakers against 7 women's, and missed 3 of
 * the 10 women's the shop actually sells. Anyone arriving from the homepage tile expecting
 * women's trainers got mostly men's.
 */
const RETIRED_COLLECTIONS: Record<string, string> = {
  "woman-sneakers-collection": "gynaikeia-sneakers",
};

async function missingCollection(request: NextRequest): Promise<NextResponse | null> {
  const slug = request.nextUrl.pathname.split("/")[2];
  if (!slug) return null;

  const retiredTo = RETIRED_COLLECTIONS[slug];
  if (retiredTo) {
    const url = request.nextUrl.clone();
    url.pathname = `/category/${retiredTo}`;
    return NextResponse.redirect(url, 308);
  }

  const live = await prisma.collection.findUnique({ where: { slug }, select: { id: true } });
  return live ? null : notFoundResponse(request);
}

/** Next only supports one proxy/middleware export per project — the admin, customer-account and category-redirect branches all live in this single function. */
/**
 * The old WooCommerce shop's URLs (SEO). alexandrisstores.gr has been live for years; its
 * 638 product URLs, categories and pages are what Google and every backlink know. The day
 * that domain points here, each of them must 301 to its successor or the authority the
 * business earned is thrown away on a 404. The map is built by
 * scripts/build-legacy-redirects.mjs and committed as data/legacy-redirects.json.
 *
 * Old paths are Greek, percent-encoded on the wire; the map holds them decoded, so the
 * incoming path is decoded before lookup. A trailing slash (WordPress always had one) is
 * ignored. 301 rather than 308: some of these links live in places that resend a POST.
 */
const LEGACY_PREFIXES = ["/product/", "/product-category/", "/product-tag/", "/shop", "/my-account", "/blog"];

function legacyRedirect(request: NextRequest): NextResponse | null {
  let path: string;
  try {
    path = decodeURIComponent(request.nextUrl.pathname).replace(/\/$/, "");
  } catch {
    return null;
  }
  const target = (legacyRedirects as Record<string, string>)[path];
  if (!target) return null;
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = "";
  return NextResponse.redirect(url, 301);
}

/**
 * Maintenance mode (services/maintenance.ts) — the dashboard switch that closes the shop.
 *
 * Every storefront page is rewritten to `/maintenance` with a **503** and a `Retry-After`,
 * which is what tells Google "temporarily down, keep the index" — the reason this lives in the
 * proxy, where a status can still be set, rather than in a layout. Starting a checkout is
 * refused the same way, so a tab that was already open before the switch was thrown cannot
 * finish an order. Everything else is left alone on purpose: the admin (the switch itself lives
 * there), the payment/courier/cron callbacks under `/api`, static files, and the cart API, which
 * the page providers call on load and which has nothing to sell on its own.
 *
 * A signed-in admin passes through, so the shop can be inspected from outside while it is
 * closed, and so does anyone holding the cookie the "back soon" page hands out for the right
 * PIN (`/api/maintenance/unlock`) — how friends get to test the shop before it opens.
 * `/maintenance` itself is only reachable while the switch is on; the rest of the time it goes
 * home, so the URL cannot be bookmarked into existence.
 */
async function maintenanceResponse(request: NextRequest, pathname: string): Promise<NextResponse | null> {
  const isMaintenancePage = pathname === "/maintenance";
  const closed = await isMaintenanceModeOn();
  if (!closed) return isMaintenancePage ? NextResponse.redirect(new URL("/", request.url)) : null;

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const admitted =
    (token && (await verifyAdminSession(token))) || (await hasValidMaintenancePass(request.cookies.get(MAINTENANCE_PASS_COOKIE)?.value));
  if (admitted) return isMaintenancePage ? NextResponse.redirect(new URL("/", request.url)) : null;

  const headers = { "Retry-After": "3600", "Cache-Control": "no-store" };
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "The shop is temporarily closed for maintenance." }, { status: 503, headers });
  }
  if (isMaintenancePage) return NextResponse.next();
  return NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503, headers });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The old WooCommerce gateway endpoint. The bank's POS still carries it as the "back
  // link" for a shopper who presses Cancel on the card form — the result URL was moved to
  // /api/payments/webhooks/piraeus, the back link was not — and appends our ParamBackLink
  // (`order=…`) as the query. Rewritten rather than redirected so a POST would arrive
  // intact too, and before the maintenance check, because a payment callback is never a
  // page. Stays after the bank updates its record: a shopper mid-payment during the
  // switch-over still lands somewhere sensible.
  if (pathname.replace(/\/$/, "") === "/wc-api/WC_Piraeusbank_Gateway") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/payments/webhooks/piraeus";
    return NextResponse.rewrite(url);
  }

  // Before the maintenance check: a 301 sells nothing, and a crawler retrying the old URLs
  // while the shop is closed should still learn where they went. The target answers 503.
  if (LEGACY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) || /%[0-9A-Fa-f]{2}/.test(pathname)) {
    const redirect = legacyRedirect(request);
    if (redirect) return redirect;
  }

  if (!pathname.startsWith("/admin")) {
    const closed = await maintenanceResponse(request, pathname);
    if (closed) return closed;
  }

  if (pathname.startsWith("/category/")) {
    const redirectResponse = await renamedCategoryRedirect(request);
    if (redirectResponse) return redirectResponse;
    return NextResponse.next();
  }

  if (pathname.startsWith("/products/")) {
    const redirectResponse = await renamedProductRedirect(request);
    if (redirectResponse) return redirectResponse;
    return NextResponse.next();
  }

  if (pathname.startsWith("/collections/")) {
    const missing = await missingCollection(request);
    if (missing) return missing;
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const isLoginRoute = pathname === "/admin/login";
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const session = token ? await verifyAdminSession(token) : null;

    if (!isLoginRoute && !session) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      const response = NextResponse.redirect(loginUrl);
      if (token) response.cookies.delete(ADMIN_SESSION_COOKIE);
      return response;
    }

    if (isLoginRoute && session) {
      // A validly-signed token whose user no longer exists is not a session. Without this
      // check the two halves of the system disagree and bounce forever: the dashboard's DAL
      // finds no user and redirects /admin -> /admin/login, while this branch sees an intact
      // signature and redirects /admin/login -> /admin. The browser is then locked out of
      // signing in as anyone until the cookie expires a day later. Deleting an admin account
      // (or restoring a database) is enough to trigger it, so clear the stale cookie and let
      // the login form render. One indexed lookup, and only on the login route.
      const stillExists = await prisma.adminUser.findUnique({
        where: { id: session.sub },
        select: { id: true },
      });
      if (!stillExists) {
        const response = NextResponse.next();
        response.cookies.delete(ADMIN_SESSION_COOKIE);
        return response;
      }
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/account")) {
    // Reachable in BOTH states, which is why it isn't simply "public": signed out, it's
    // the page an emailed reset link lands on (gating it behind a session made the whole
    // forgot-password flow unreachable — the link bounced straight to /account/login);
    // signed in, someone who requested a reset before logging in elsewhere must still be
    // able to finish it rather than be bounced to /account with their token discarded.
    if (pathname === "/account/reset-password" || pathname === "/account/verify-email") return NextResponse.next();

    const isPublicRoute = pathname === "/account/login" || pathname === "/account/register";
    const token = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
    const session = token ? await verifyCustomerSession(token) : null;

    if (!isPublicRoute && !session) {
      const loginUrl = new URL("/account/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      const response = NextResponse.redirect(loginUrl);
      if (token) response.cookies.delete(CUSTOMER_SESSION_COOKIE);
      return response;
    }

    if (isPublicRoute && session) {
      return NextResponse.redirect(new URL("/account", request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // `/collections/:path*` joined this list for SEO-002 — the proxy is now the only place these
  // routes can answer 404 with a status, so it has to see them.
  matcher: [
    // Maintenance mode has to see every storefront page, so the proxy now runs on everything
    // except `/api` (the two checkout entries below are the exception), Next's own assets, the
    // admin (listed separately) and anything with a file extension. Also the only reason
    // `/maintenance` is matched at all.
    "/((?!api/|_next/|admin(?:/|$)|.*\\..*).*)",
    "/api/checkout/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/category/:path*",
    "/products/:path*",
    "/collections/:path*",
    // The old WooCommerce shop's URL space — see legacyRedirect. Greek page slugs
    // (/επικοινωνία, /η-εταιρεία, …) arrive percent-encoded, hence the last pattern.
    "/product/:path*",
    "/product-category/:path*",
    "/product-tag/:path*",
    "/shop",
    "/my-account/:path*",
    "/blog/:path*",
    "/:slug(%[0-9A-Fa-f]{2}.*)",
  ],
};
