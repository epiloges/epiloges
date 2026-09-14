import pg from "pg";
import fs from "node:fs";
const which = process.argv[2] || "test";
const envFile = which === "test" ? ".env.test" : ".env";
const key = which === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
const line = fs.readFileSync(envFile, "utf8").split(/\r?\n/).find(l => l.startsWith(key + "="));
const url = line.slice(key.length + 1).replace(/^"|"$/g, "");
const c = new pg.Client({ connectionString: url });
await c.connect();
const r = await c.query(`select table_name from information_schema.tables where table_schema='public' order by 1`);
console.log(which, "tables:", r.rows.length);
for (const row of r.rows) {
  const n = await c.query(`select count(*)::int as n from "${row.table_name}"`);
  console.log(row.table_name.padEnd(30), n.rows[0].n);
}
await c.end();
