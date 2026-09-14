// Read-only export of the live catalogue for content authoring. Writes to the path given as argv[2].
import { config } from "dotenv";
import pg from "pg";
import fs from "node:fs";

config({ quiet: true });
const out = process.argv[2];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  `select p.id, p.slug, p.name, p.description, p.brand, p.gender, p.season, p.materials, p."careInstructions", p.tags,
          p."priceAmount"::float as price, p."salePriceAmount"::float as sale, c."nameEl" as category, c.slug as "categorySlug",
          (select string_agg(col.name, ', ' order by col.position) from product_colors col where col."productId" = p.id) as colors,
          (select string_agg(s.name, ',' order by s.position) from product_sizes s where s."productId" = p.id and s."inStock") as "sizesInStock",
          (select string_agg(s.name, ',' order by s.position) from product_sizes s where s."productId" = p.id) as sizes
   from products p join categories c on c.id = p."categoryId"
   where p.status = 'active'
   order by c."nameEl", p.brand nulls last, p.name`
);
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(rows.length, "products; thin:", rows.filter((x) => (x.description ?? "").length < 200).length);
const byCat = {};
for (const x of rows) byCat[x.category] = (byCat[x.category] ?? 0) + 1;
console.log(byCat);
await c.end();
