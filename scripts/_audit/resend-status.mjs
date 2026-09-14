// Read-only: which domains the Resend account has verified, and what recent sends looked like.
import fs from "node:fs";
import { Resend } from "resend";
const line = fs.readFileSync(".env", "utf8").split(/\r?\n/).find((l) => l.startsWith("RESEND_API_KEY="));
const key = line?.slice("RESEND_API_KEY=".length).replace(/^"|"$/g, "");
if (!key) { console.log("no RESEND_API_KEY in .env"); process.exit(0); }
const resend = new Resend(key);
const domains = await resend.domains.list();
console.log("domains:", JSON.stringify(domains.data?.data?.map((d) => ({ name: d.name, status: d.status, region: d.region })) ?? domains.error, null, 1));
const emails = await resend.emails.list({ limit: 20 }).catch((e) => ({ error: String(e) }));
const rows = emails.data?.data ?? [];
console.log("recent sends:", rows.length);
for (const e of rows) console.log(` ${e.created_at}  ${e.last_event.padEnd(10)} to=${(e.to||[]).map(t=>t.replace(/^(.).*@/,'$1***@')).join(",")}  from=${e.from}  "${e.subject}"`);
if (emails.error) console.log("emails.list error:", emails.error);
