// Inserts authored journal articles as UNPUBLISHED drafts (publishedAt far in the future — the
// blog has no draft flag; a future date is how a post is held back). The owner publishes by
// setting the date in the admin. Usage: node scripts/_audit/apply-articles.mjs <dir> sandbox|production [--dry]
import { config } from "dotenv";
import pg from "pg";
import path from "node:path";
import crypto from "node:crypto";

const [dir, target, flag] = process.argv.slice(2);
if (!dir || !["sandbox", "production"].includes(target)) throw new Error("usage");
config({ quiet: true });
if (target === "sandbox") config({ path: ".env.test", quiet: true, override: true });
const url = target === "sandbox" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

const { default: articles } = await import("file:///" + path.join(dir, "articles.mjs").replace(/\\/g, "/"));
const HELD = new Date("2030-01-01T09:00:00Z");
const cuid = () => "c" + crypto.randomBytes(12).toString("hex");

const client = new pg.Client({ connectionString: url });
await client.connect();
let inserted = 0, skipped = 0;
for (const a of articles) {
  const candidates = Array.isArray(a.cover) ? a.cover : [a.cover];
  let image;
  for (const slug of candidates) {
    const cover = await client.query(`select images->0 as image from products where slug = $1`, [slug]);
    if (cover.rows[0]?.image?.src) { image = cover.rows[0].image; break; }
  }
  if (!image?.src) { console.warn("no cover image for", a.slug, "→", a.cover); continue; }
  const exists = await client.query(`select 1 from blog_posts where slug = $1`, [a.slug]);
  if (exists.rowCount) { skipped += 1; continue; }
  if (flag === "--dry") { inserted += 1; continue; }
  await client.query(
    `insert into blog_posts (id, slug, title, excerpt, content, "coverImage", author, tags, "publishedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [cuid(), a.slug, a.title, a.excerpt, a.content.trim(), JSON.stringify({ src: image.src, alt: a.title }), "ALEXANDRIS", a.tags, HELD]
  );
  inserted += 1;
}
console.log(`${target}: ${flag === "--dry" ? "would insert" : "inserted"} ${inserted}, already present ${skipped}`);
await client.end();
