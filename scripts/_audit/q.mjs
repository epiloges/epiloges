import pg from "pg";
import fs from "node:fs";
const line = fs.readFileSync(".env.test", "utf8").split(/\r?\n/).find(l => l.startsWith("TEST_DATABASE_URL="));
const url = line.slice("TEST_DATABASE_URL=".length).replace(/^"|"$/g, "");
const c = new pg.Client({ connectionString: url });
await c.connect();
const sql = process.argv.slice(2).join(" ");
try { const r = await c.query(sql); console.log(JSON.stringify(r.rows, null, 1)); console.log(`(${r.rowCount} rows)`); }
catch (e) { console.error("ERR", e.message); }
await c.end();
