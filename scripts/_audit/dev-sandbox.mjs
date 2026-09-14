// Starts `next dev` against the TEST Neon branch with outbound email disabled.
// Everything else comes from .env as usual. Session-only audit tooling.
import { spawn } from "node:child_process";
import fs from "node:fs";
const line = fs.readFileSync(".env.test", "utf8").split(/\r?\n/).find(l => l.startsWith("TEST_DATABASE_URL="));
const url = line.slice("TEST_DATABASE_URL=".length).replace(/^"|"$/g, "");
const direct = url.replace("-pooler", "");
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: direct,
  EMAIL_PROVIDER: "dev",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3010",
};
const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", "3010"], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
