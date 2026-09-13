import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, resolvePage, toPaged, type Paged } from "@/lib/pagination";

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  sentAt: string;
}

function toEmailLogEntry(row: { id: string; to: string; subject: string; html: string; text: string; template: string; sentAt: Date }): EmailLogEntry {
  return { ...row, sentAt: row.sentAt.toISOString() };
}

export async function getAllEmailLogsForAdmin(): Promise<EmailLogEntry[]> {
  const rows = await prisma.emailLog.findMany({ orderBy: { sentAt: "desc" }, take: 200 });
  return rows.map(toEmailLogEntry);
}

export interface EmailLogQuery {
  search?: string;
  template?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The admin list, searched and paged in SQL. It used to be the newest 200 rows and nothing
 * else — with 280 already logged, "did we send the confirmation for that August order?"
 * had no answer from this page.
 */
export async function listEmailLogsForAdmin(query: EmailLogQuery = {}): Promise<Paged<EmailLogEntry>> {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const search = query.search?.trim();
  const where: Prisma.EmailLogWhereInput = {
    ...(query.template ? { template: query.template } : {}),
    ...(search
      ? { OR: [{ to: { contains: search, mode: "insensitive" } }, { subject: { contains: search, mode: "insensitive" } }] }
      : {}),
  };
  const total = await prisma.emailLog.count({ where });
  const { page, skip, take } = resolvePage(total, { page: query.page ?? 1, pageSize });
  const rows = await prisma.emailLog.findMany({ where, orderBy: { sentAt: "desc" }, skip, take });
  return toPaged(rows.map(toEmailLogEntry), total, page, pageSize);
}

/** Which provider actually sends — for the page's description, so it never claims "dev" in production. */
export function emailProviderLabel(): string {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  return configured === "resend" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "Resend" : "the dev provider (nothing is actually sent)";
}

export async function getEmailLogById(id: string): Promise<EmailLogEntry | null> {
  const row = await prisma.emailLog.findUnique({ where: { id } });
  return row ? toEmailLogEntry(row) : null;
}
