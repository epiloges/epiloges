// Applies authored product descriptions. Usage:
//   node scripts/_audit/apply-descriptions.mjs <scratchpad-dir> sandbox|production [--dry]
// Backs up every previous description to <scratchpad-dir>/descriptions-backup-<target>.json first.
// Restore: node scripts/_audit/apply-descriptions.mjs <scratchpad-dir> <target> --restore
import { config } from "dotenv";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const [dir, target, flag] = process.argv.slice(2);
if (!dir || !["sandbox", "production"].includes(target)) throw new Error("usage: <dir> sandbox|production [--dry|--restore]");
config({ quiet: true });
if (target === "sandbox") config({ path: ".env.test", quiet: true, override: true });
const url = target === "sandbox" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!url) throw new Error("no database url for " + target);

const thin = JSON.parse(fs.readFileSync(path.join(dir, "thin.json"), "utf8"));
const bySlug = new Map(thin.map((p) => [p.slug, p]));
const texts = {};
for (const file of ["desc-batch1.mjs", "desc-batch2.mjs", "desc-batch3.mjs", "desc-batch4.mjs"]) {
  const mod = await import(path.join(dir, file).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
  Object.assign(texts, mod.default);
}
const missing = thin.filter((p) => !texts[p.n]);
if (missing.length) console.warn("no text for", missing.map((p) => `#${p.n} ${p.name}`).join("\n"));

const client = new pg.Client({ connectionString: url });
await client.connect();
const backupFile = path.join(dir, `descriptions-backup-${target}.json`);

if (flag === "--restore") {
  const backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  let n = 0;
  for (const [slug, description] of Object.entries(backup)) {
    const r = await client.query(`update products set description = $1 where slug = $2`, [description, slug]);
    n += r.rowCount;
  }
  console.log("restored", n);
  await client.end();
  process.exit(0);
}

const { rows } = await client.query(`select slug, description from products where slug = any($1)`, [[...bySlug.keys()]]);
const backup = Object.fromEntries(rows.map((r) => [r.slug, r.description]));
if (!fs.existsSync(backupFile)) fs.writeFileSync(backupFile, JSON.stringify(backup, null, 1));
console.log(`${target}: ${rows.length} of ${thin.length} products found; backup at ${backupFile}`);

let updated = 0;
for (const p of thin) {
  const text = texts[p.n];
  if (!text || !(p.slug in backup)) continue;
  const clean = text.trim().replace(/\r\n/g, "\n");
  if (flag === "--dry") { updated += 1; continue; }
  const r = await client.query(`update products set description = $1, "updatedAt" = now() where slug = $2`, [clean, p.slug]);
  updated += r.rowCount;
}
console.log(flag === "--dry" ? "would update" : "updated", updated);
await client.end();
