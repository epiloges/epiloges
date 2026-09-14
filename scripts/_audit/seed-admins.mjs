// Sandbox-only: creates/removes throwaway admin accounts on the TEST branch.
import pg from "pg";
import fs from "node:fs";
import bcrypt from "bcryptjs";
const line = fs.readFileSync(".env.test", "utf8").split(/\r?\n/).find(l => l.startsWith("TEST_DATABASE_URL="));
const url = line.slice("TEST_DATABASE_URL=".length).replace(/^"|"$/g, "");
const c = new pg.Client({ connectionString: url });
await c.connect();
if (process.argv[2] === "remove") {
  const r = await c.query(`delete from admin_users where email like '%@sandbox.local' returning email`);
  console.log("removed", r.rows.map(x => x.email));
} else {
  const hash = await bcrypt.hash("Audit-Sandbox-2026!", 10);
  for (const [id, email, name, role] of [
    ["audit_admin_0001", "audit-admin@sandbox.local", "Audit Admin", "admin"],
    ["audit_editor_001", "audit-editor@sandbox.local", "Audit Editor", "editor"],
  ]) {
    await c.query(`insert into admin_users (id,email,"passwordHash",name,role,"createdAt") values ($1,$2,$3,$4,$5,now())
      on conflict (email) do update set "passwordHash"=excluded."passwordHash", role=excluded.role`, [id, email, hash, name, role]);
    console.log("upserted", email, role);
  }
}
await c.end();
