// Emits the SQL that writes data/seo-content/*.json into categories.seo / collections.seo
// (merging over whatever override each row already has, so an admin's ogImage or canonical
// survives), plus the site-wide defaults. Prints to stdout; run it through psql, the Neon
// console, or the Neon MCP connector — it deliberately does not connect anywhere itself.
//
//   node scripts/seo/build-seo-content-sql.mjs > /tmp/seo.sql
import fs from "node:fs";

const lit = (value) => "'" + String(value).replace(/'/g, "''") + "'";
const json = (value) => lit(JSON.stringify(value)) + "::jsonb";
const merge = (table, slug, seo) =>
  `UPDATE ${table} SET seo = coalesce(seo::jsonb, '{}'::jsonb) || ${json(seo)} WHERE slug = ${lit(slug)};`;

const out = ["BEGIN;"];
for (const [table, file] of [["categories", "categories"], ["collections", "collections"]]) {
  const content = JSON.parse(fs.readFileSync(`data/seo-content/${file}.json`, "utf8"));
  for (const [slug, seo] of Object.entries(content)) {
    if (slug.startsWith("_")) continue;
    out.push(merge(table, slug, seo));
  }
}

// Site-wide: the home page title/description and the Organization name. Everything else in
// the seo row (titleTemplate, sameAs, logo) is left as the admin set it.
const site = {
  defaultTitle: "Παπούτσια Ηράκλειο & Online – Γυναικεία & Ανδρικά | Alexandris Stores",
  defaultDescription:
    "Καταστήματα Αλεξανδρής: κατάστημα παπουτσιών στο Ηράκλειο Κρήτης από το 1984, τώρα online για όλη την Ελλάδα. Γυναικεία & ανδρικά παπούτσια, τσάντες, δωρεάν επιστροφές 14 ημερών.",
};
out.push(
  `UPDATE site_content SET data = (data::jsonb || ${json(site)})::json, "updatedAt" = now() WHERE key = 'seo';`
);

// Fila: two women's sneakers carry the brand in their name but not in the brand column, so
// the brand page and feeds never knew. Same rule the admin form applies — brand is a field.
out.push(`UPDATE products SET brand = 'Fila' WHERE status = 'active' AND coalesce(brand, '') = '' AND name ILIKE 'Fila %';`);
out.push("COMMIT;");
process.stdout.write(out.join("\n") + "\n");
