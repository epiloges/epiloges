import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createEmailPipeline } from "@/lib/email/pipeline";
import { recordUnsubscribe } from "@/lib/email/unsubscribe";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Against the real (test-branch) database, because the point of the pipeline is what it
 * writes to email_log: a failed send used to leave no row at all.
 */
const tag = Math.random().toString(36).slice(2, 10);
const address = (local: string) => `pipeline-${tag}-${local}@mail.local`;

function transport(deliver: EmailTransport["deliver"]): EmailTransport {
  return { name: "dev", from: "test@localhost", deliver };
}

const base = (to: string, template: EmailMessage["template"] = "order-confirmation"): EmailMessage => ({
  to,
  subject: `pipeline test ${tag}`,
  html: "<html><body>hi<!-- unsubscribe --></body></html>",
  text: "hi",
  template,
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("email pipeline", () => {
  beforeAll(async () => {
    await prisma.emailLog.deleteMany({ where: { subject: `pipeline test ${tag}` } });
  });
  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { subject: `pipeline test ${tag}` } });
    await prisma.emailUnsubscribe.deleteMany({ where: { email: { contains: `pipeline-${tag}` } } });
  });

  it("records a final failure as a row with the provider's reason, and throws", async () => {
    const pipeline = createEmailPipeline(
      transport(async () => {
        throw new Error("Resend: You can only send testing emails to your own email address");
      })
    );
    await expect(pipeline.send(base(address("fail")))).rejects.toThrow(/own email address/);
    const row = await prisma.emailLog.findFirst({ where: { to: address("fail") } });
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/own email address/);
    // Not transient — one attempt, no backoff loop.
    expect(row?.attempts).toBe(1);
  });

  it("retries a transient error and records the successful attempt count", async () => {
    let calls = 0;
    const pipeline = createEmailPipeline(
      transport(async () => {
        calls += 1;
        if (calls < 2) throw Object.assign(new Error("rate limit exceeded"), { code: "rate_limit_exceeded" });
        return { status: "sent", providerMessageId: "msg_1" };
      })
    );
    const outcome = await pipeline.send(base(address("retry")));
    expect(outcome.status).toBe("sent");
    const row = await prisma.emailLog.findFirst({ where: { to: address("retry") } });
    expect(row?.status).toBe("sent");
    expect(row?.attempts).toBe(2);
    expect(row?.providerMessageId).toBe("msg_1");
  }, 15_000);

  it("adds an unsubscribe link and header to marketing mail, and none to transactional mail", async () => {
    const delivered: EmailMessage[] = [];
    const pipeline = createEmailPipeline(
      transport(async (message) => {
        delivered.push(message);
        return { status: "sent" };
      })
    );
    await pipeline.send(base(address("marketing"), "abandoned-cart"));
    await pipeline.send(base(address("receipt"), "order-confirmation"));
    expect(delivered[0].headers?.["List-Unsubscribe"]).toMatch(/\/api\/email\/unsubscribe\?t=/);
    expect(delivered[0].html).toMatch(/Διαγραφή από τη λίστα/);
    expect(delivered[1].headers).toBeUndefined();
    expect(delivered[1].html).not.toMatch(/Διαγραφή/);
  });

  it("skips marketing mail to an address that opted out, but still sends receipts", async () => {
    await recordUnsubscribe(address("opted-out"), "test");
    const delivered: string[] = [];
    const pipeline = createEmailPipeline(
      transport(async (message) => {
        delivered.push(message.template);
        return { status: "sent" };
      })
    );
    const skipped = await pipeline.send(base(address("opted-out"), "review-request"));
    expect(skipped.status).toBe("skipped");
    await pipeline.send(base(address("opted-out"), "shipping-update"));
    expect(delivered).toEqual(["shipping-update"]);
    const row = await prisma.emailLog.findFirst({ where: { to: address("opted-out"), template: "review-request" } });
    expect(row?.status).toBe("skipped");
  });
});
