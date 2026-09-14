/**
 * Builds data/legacy-redirects.json: every URL the old WooCommerce shop at
 * alexandrisstores.gr published, mapped to where it lives on this one.
 *
 * The old shop is still live ("under renewal"), its sitemap still lists 638 product URLs,
 * and that domain carries every backlink and every ranking the business has earned. When
 * it is pointed at this deployment, each of those URLs must answer with a 301 to the
 * right page — not a 404 — or the authority is thrown away. proxy.ts serves the map.
 *
 * Matching: every migrated product's slug ends in its WooCommerce post id
 * ("…-blk112-13567"), which is how the import kept the link. A product that was not
 * migrated redirects to its old category's new equivalent, else to the shop root.
 *
 * Usage:  node scripts/build-legacy-redirects.mjs   (needs DATABASE_URL in .env)
 * Re-run whenever products are renamed; the map is committed.
 */
import fs from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ quiet: true });
const OLD = "https://alexandrisstores.gr";
const OUT = "data/legacy-redirects.json";

/**
 * Old WooCommerce category id → new path. Keyed by id because the old slugs are
 * percent-encoded Greek. Hand-mapped: the taxonomies do not line up 1:1 — the old shop
 * sold slippers, bags and belts this one does not, and those land on the nearest gender
 * page or the root rather than on a product that is not there.
 */
const CATEGORY_MAP = {
  68: "/men", // Ανδρικά
  204: "/women", // Γυναικεία
  211: "/category/gynaikeia-loafers", // Loafers - μοκασίνια (γυναικεία)
  223: "/category/gynaikeia-sneakers", // Sneakers (γυναικεία)
  230: "/women", // Ανατομικά (γυναικεία)
  212: "/category/heels", // Γόβες
  234: "/women", // Εσπαντρίγιες
  203: "/category/gynaikeia-boots", // Μποτάκια (root)
  205: "/category/gynaikeia-boots", // Μποτάκια (γυναικεία)
  220: "/category/gynaikeia-boots", // Μπότες
  231: "/women", // Παντόφλες — not carried
  225: "/category/sandals", // Πέδιλα
  70: "/category/andrika-sneakers", // Αθλητικά (ανδρικά)
  113: "/category/oxfords", // Αμπιγιέ
  97: "/category/oxfords", // Δετά
  69: "/men", // Ανατομικά (ανδρικά)
  109: "/category/andrika-loafers", // Ιστιοπλοϊκά
  110: "/category/andrika-loafers", // Μοκασίνια (ανδρικά)
  111: "/men", // Καθημερινά
  138: "/men", // Μεγάλα νούμερα
  71: "/category/andrika-boots", // Μποτάκια (ανδρικά)
  114: "/men", // Πέδιλα - παντόφλες (ανδρικά)
  72: "/sale", // Προσφορές
  156: "/sale", // Outlet
};

/** Old page slug → new path. Anything absent falls back to "/". */
const PAGE_MAP = {
  shop: "/",
  cart: "/cart",
  checkout: "/checkout",
  "my-account": "/account",
  epikoinonia: "/contact",
  contact: "/contact",
  "contact-us": "/contact",
  about: "/about",
  "about-us": "/about",
  "i-etairia": "/about",
  faq: "/faq",
  "faqs": "/faq",
  "oroi-chrisis": "/legal/terms",
  "oroi-xrisis": "/legal/terms",
  "terms": "/legal/terms",
  "politiki-aporritou": "/legal/privacy",
  "privacy-policy": "/legal/privacy",
  "politiki-cookies": "/legal/cookies",
  "cookie-policy": "/legal/cookies",
  "apostoles-epistrofes": "/shipping-returns",
  "tropoi-apostolis": "/shipping-returns",
  "epistrofes": "/shipping-returns",
  "shipping-returns": "/shipping-returns",
  "odigos-megethon": "/size-guide",
  "size-guide": "/size-guide",
  blog: "/journal",
  // Greek slugs, decoded — WordPress percent-encodes them in links.
  "επικοινωνία": "/contact",
  "επιστροφές": "/shipping-returns",
  "τρόποι-πληρωμής": "/faq",
  "η-εταιρεία": "/about",
  "αρχική": "/",
  "b2b-χονδρική": "/contact",
  "track-order": "/account",
};

async function wp(path, query = {}) {
  const url = new URL(`${OLD}/wp-json/wp/v2/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const response = await fetch(url, { headers: { "user-agent": "alexandris-migration/1.0" } });
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return { body: await response.json(), totalPages: Number(response.headers.get("x-wp-totalpages") ?? 1) };
}

async function wpAll(path, query = {}) {
  const first = await wp(path, { ...query, per_page: 100, page: 1 });
  const rows = [...first.body];
  for (let page = 2; page <= first.totalPages; page += 1) rows.push(...(await wp(path, { ...query, per_page: 100, page })).body);
  return rows;
}

function pathOf(link) {
  const { pathname } = new URL(link);
  return decodeURIComponent(pathname).replace(/\/$/, "");
}

const sitemapLocs = async (name) => {
  const xml = await fetch(`${OLD}/${name}-sitemap.xml`).then((r) => (r.ok ? r.text() : ""));
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows: products } = await client.query(`select slug from products where status = 'active'`);
await client.end();
const byWcId = new Map();
for (const { slug } of products) {
  const m = slug.match(/-(\d{3,7})$/);
  if (m) byWcId.set(Number(m[1]), `/products/${slug}`);
}

const [wcProducts, wcCategories, wcPages, pageLocs, tagLocs] = await Promise.all([
  wpAll("product", { _fields: "id,link,product_cat,status" }),
  wpAll("product_cat", { _fields: "id,slug,link,parent,name" }),
  wpAll("pages", { _fields: "id,link,slug" }),
  sitemapLocs("page"),
  sitemapLocs("product_tag"),
]);

const catById = new Map(wcCategories.map((c) => [c.id, c]));
const categoryTarget = (cat) => {
  for (let c = cat, depth = 0; c && depth < 6; c = catById.get(c.parent), depth += 1) {
    if (CATEGORY_MAP[c.id]) return CATEGORY_MAP[c.id];
  }
  return null;
};

const map = {};
const stats = { product: 0, productToCategory: 0, productToRoot: 0, category: 0, categoryToRoot: 0, page: 0, tag: 0, other: 0 };

for (const p of wcProducts) {
  const from = pathOf(p.link);
  const exact = byWcId.get(p.id);
  if (exact) { map[from] = exact; stats.product += 1; continue; }
  const cat = (p.product_cat ?? []).map((id) => catById.get(id)).find(Boolean);
  const target = cat ? categoryTarget(cat) : null;
  map[from] = target ?? "/";
  if (target) stats.productToCategory += 1; else stats.productToRoot += 1;
}
for (const c of wcCategories) {
  const from = pathOf(c.link);
  const target = categoryTarget(c);
  map[from] = target ?? "/";
  if (target) stats.category += 1; else { stats.categoryToRoot += 1; console.warn("unmapped category:", c.slug, `(${c.name})`); }
}
for (const page of wcPages) {
  const from = pathOf(page.link);
  if (from === "" || from === "/") continue;
  map[from] = PAGE_MAP[decodeURIComponent(page.slug)] ?? "/";
  stats.page += 1;
}
for (const loc of pageLocs) {
  const from = pathOf(loc);
  if (from && !(from in map)) { map[from] = PAGE_MAP[from.split("/").pop()] ?? "/"; stats.other += 1; }
}
for (const loc of tagLocs) {
  const from = pathOf(loc);
  if (from && !(from in map)) { map[from] = "/"; stats.tag += 1; }
}
// Blanket WooCommerce paths that never appear in a sitemap.
Object.assign(map, { "/shop": "/", "/cart": "/cart", "/checkout": "/checkout", "/my-account": "/account", "/wishlist": "/wishlist" });

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(map, null, 0) + "\n");
console.log(`${Object.keys(map).length} redirects → ${OUT}`);
console.log(stats);
