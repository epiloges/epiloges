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
  status: "sent" | "failed" | "skipped";
  error: string | null;
  providerMessageId: string | null;
  attempts: number;
}

function toEmailLogEntry(row: {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  sentAt: Date;
  status: string;
  error: string | null;
  providerMessageId: string | null;
  attempts: number;
}): EmailLogEntry {
  const status = row.status === "failed" || row.status === "skipped" ? row.status : "sent";
  return { ...row, status, sentAt: row.sentAt.toISOString() };
}

export async function getAllEmailLogsForAdmin(): Promise<EmailLogEntry[]> {
  const rows = await prisma.emailLog.findMany({ orderBy: { sentAt: "desc" }, take: 200 });
  return rows.map(toEmailLogEntry);
}

export interface EmailLogQuery {
  search?: string;
  template?: string;
  status?: "sent" | "failed" | "skipped";
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
    ...(query.status ? { status: query.status } : {}),
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

/** Failed sends in the last day — the dashboard's "something is wrong with email" signal. */
export async function countRecentEmailFailures(hours = 24): Promise<number> {
  return prisma.emailLog.count({ where: { status: "failed", sentAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) } } });
}
