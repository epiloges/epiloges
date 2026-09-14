// Publishes every held journal post (publishedAt in the future) in production, staggered a
// minute apart in insertion order so the journal index keeps a stable sequence.
import { config } from "dotenv";
import pg from "pg";

config({ quiet: true });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const held = await c.query(`select id, slug from blog_posts where "publishedAt" > now() order by "createdAt"`);
let n = 0;
for (const row of held.rows) {
  const minutesAgo = held.rows.length - n;
  await c.query(`update blog_posts set "publishedAt" = now() - make_interval(mins => $1) where id = $2`, [minutesAgo, row.id]);
  n += 1;
}
const r = await c.query(`select slug, to_char("publishedAt", 'YYYY-MM-DD HH24:MI') as at from blog_posts where "publishedAt" > now() - interval '1 hour' order by "publishedAt" desc`);
console.log("published", n);
console.log(r.rows.map((x) => `${x.at}  ${x.slug}`).join("\n"));
await c.end();
