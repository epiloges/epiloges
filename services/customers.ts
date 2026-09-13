import "server-only";
import { DEFAULT_PAGE_SIZE, resolvePage, toPaged } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { customerInclude, toCustomer } from "@/lib/commerce/postgres/mappers";
import { round2 } from "@/lib/commerce/postgres/cart-totals";
import type { Address, Customer } from "@/lib/commerce/types";

export async function getCustomerById(id: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { id }, include: customerInclude });
  return row ? toCustomer(row) : null;
}

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { email: email.toLowerCase() }, include: customerInclude });
  return row ? toCustomer(row) : null;
}

export async function createCustomer(input: {
  email: string;
  /** Omitted for an OAuth-only signup — see findOrCreateCustomerForOAuth below. */
  passwordHash?: string;
  firstName: string;
  lastName: string;
}): Promise<Customer> {
  const row = await prisma.customer.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    include: customerInclude,
  });
  return toCustomer(row);
}

/**
 * Resolves an OAuth login to a Customer row: an existing linked account wins outright;
 * failing that, a verified-email match on an existing password-based Customer is
 * auto-linked (Google/Apple/Facebook all verify email ownership before issuing a token,
 * so this matches the trust level this app already extends to plain email/password
 * sign-up, which has no separate email-verification step either); failing that, a new
 * Customer + CustomerOAuthAccount are created together.
 */
export async function findOrCreateCustomerForOAuth(input: {
  provider: string;
  providerUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}): Promise<{ customer: Customer; created: boolean }> {
  const existingAccount = await prisma.customerOAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: input.provider, providerUserId: input.providerUserId } },
    include: { customer: { include: customerInclude } },
  });
  if (existingAccount) return { customer: toCustomer(existingAccount.customer), created: false };

  const email = input.email?.toLowerCase();
  const existingCustomer = email ? await prisma.customer.findUnique({ where: { email } }) : null;

  if (existingCustomer) {
    await prisma.customerOAuthAccount.create({
      data: { customerId: existingCustomer.id, provider: input.provider, providerUserId: input.providerUserId, email: input.email },
    });
    return { customer: (await getCustomerById(existingCustomer.id))!, created: false };
  }

  const created = await prisma.customer.create({
    data: {
      email: email ?? `${input.provider}-${input.providerUserId}@oauth.alexandris.invalid`,
      passwordHash: null,
      firstName: input.firstName ?? "Customer",
      lastName: input.lastName ?? "",
      oauthAccounts: { create: { provider: input.provider, providerUserId: input.providerUserId, email: input.email } },
    },
    include: customerInclude,
  });
  return { customer: toCustomer(created), created: true };
}

export async function updateCustomerProfile(
  customerId: string,
  patch: Partial<Pick<Customer, "firstName" | "lastName" | "phone" | "acceptsMarketing">>
): Promise<Customer> {
  const row = await prisma.customer.update({ where: { id: customerId }, data: patch, include: customerInclude });
  return toCustomer(row);
}

export async function addCustomerAddress(customerId: string, address: Address): Promise<Customer> {
  const position = await prisma.customerAddress.count({ where: { customerId } });
  await prisma.customerAddress.create({ data: { customerId, position, ...address } });
  return (await getCustomerById(customerId))!;
}

async function requireOwnAddress(customerId: string, addressId: string) {
  const address = await prisma.customerAddress.findUnique({ where: { id: addressId } });
  if (!address || address.customerId !== customerId) {
    throw new Error("Address not found.");
  }
  return address;
}

export async function updateCustomerAddress(customerId: string, addressId: string, address: Address): Promise<Customer> {
  await requireOwnAddress(customerId, addressId);
  await prisma.customerAddress.update({ where: { id: addressId }, data: address });
  return (await getCustomerById(customerId))!;
}

export async function removeCustomerAddress(customerId: string, addressId: string): Promise<Customer> {
  await requireOwnAddress(customerId, addressId);
  await prisma.customerAddress.delete({ where: { id: addressId } });
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (customer?.defaultAddressId === addressId) {
    await prisma.customer.update({ where: { id: customerId }, data: { defaultAddressId: null } });
  }
  return (await getCustomerById(customerId))!;
}

export async function updateCustomerPasswordHash(customerId: string, passwordHash: string): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    // Retires every session issued before now (AUTH-001). Changing a password is the one
    // action people take specifically to lock somebody else out, so it has to.
    data: { passwordHash, sessionsValidFrom: new Date() },
  });
}

/**
 * One row per email address the shop has dealt with. Guests never get a Customer row, and
 * an order placed from a cart that started before sign-in has no customerId either, so
 * matching orders by customerId under-counts everyone. Email is the one thing every order
 * carries, so it is the key here — a guest shows up with the name from their shipping
 * address, and an account holder's guest orders count towards them.
 */
export interface AdminCustomerRow {
  /** Customer id for an account, `guest:<email>` otherwise — stable enough for a table key. */
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** Sign-up date for an account, first order date for a guest. */
  createdAt: string;
  hasAccount: boolean;
  ordersCount: number;
  totalSpent: number;
}

export async function getAllCustomersForAdmin(): Promise<AdminCustomerRow[]> {
  /**
   * Orders aggregated in SQL — one row per email with the count, the money that still
   * stands (cancelled and refunded orders excluded, see lib/order-revenue.ts), and the
   * name and phone from the most recent shipping address. This used to load every order
   * row and parse every address JSON in JavaScript on each page view, and a single
   * malformed address threw and took the whole page with it. Reads that are not
   * addresses now degrade to "—" rather than to a 500.
   */
  const [accounts, orderRows] = await Promise.all([
    prisma.customer.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.$queryRaw<
      { email: string; ordersCount: number; totalSpent: number; firstName: string | null; lastName: string | null; phone: string | null; firstOrderAt: Date }[]
    >`
      SELECT
        lower(o."customerEmail") AS email,
        count(*)::int AS "ordersCount",
        coalesce(sum((o.totals->'total'->>'amount')::numeric) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0)::float AS "totalSpent",
        (array_agg(o."shippingAddress"->>'firstName' ORDER BY o."createdAt" DESC))[1] AS "firstName",
        (array_agg(o."shippingAddress"->>'lastName' ORDER BY o."createdAt" DESC))[1] AS "lastName",
        (array_agg(o."shippingAddress"->>'phone' ORDER BY o."createdAt" DESC))[1] AS phone,
        min(o."createdAt") AS "firstOrderAt"
      FROM orders o
      GROUP BY lower(o."customerEmail")
    `,
  ]);

  const rows = new Map<string, AdminCustomerRow>();
  for (const account of accounts) {
    rows.set(account.email.toLowerCase(), {
      id: account.id,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone ?? undefined,
      createdAt: account.createdAt.toISOString(),
      hasAccount: true,
      ordersCount: 0,
      totalSpent: 0,
    });
  }

  for (const agg of orderRows) {
    const existing = rows.get(agg.email);
    if (existing) {
      existing.ordersCount = agg.ordersCount;
      existing.totalSpent = round2(agg.totalSpent);
      if (!existing.phone && agg.phone) existing.phone = agg.phone;
      continue;
    }
    rows.set(agg.email, {
      id: `guest:${agg.email}`,
      email: agg.email,
      firstName: agg.firstName ?? "—",
      lastName: agg.lastName ?? "",
      phone: agg.phone || undefined,
      createdAt: agg.firstOrderAt.toISOString(),
      hasAccount: false,
      ordersCount: agg.ordersCount,
      totalSpent: round2(agg.totalSpent),
    });
  }

  return [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Search (name, email, phone) and page the aggregated list — the set is one row per person, so paging in memory is cheap. */
export async function listCustomersForAdmin(query: { search?: string; page?: number; pageSize?: number } = {}) {
  const all = await getAllCustomersForAdmin();
  const needle = query.search?.trim().toLowerCase();
  const filtered = needle
    ? all.filter((row) => `${row.firstName} ${row.lastName} ${row.email} ${row.phone ?? ""}`.toLowerCase().includes(needle))
    : all;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const { page, skip, take } = resolvePage(filtered.length, { page: query.page ?? 1, pageSize });
  return {
    ...toPaged(filtered.slice(skip, skip + take), filtered.length, page, pageSize),
    accounts: all.filter((row) => row.hasAccount).length,
    everyone: all.length,
  };
}

/**
 * One customer, by account id, by `guest:<email>`, or by `email:<email>` — the last for
 * callers that only hold an email (an order row) and do not know whether it belongs to an
 * account.
 */
export async function getCustomerForAdmin(key: string): Promise<AdminCustomerRow | null> {
  const all = await getAllCustomersForAdmin();
  const byEmail = key.startsWith("email:") ? key.slice("email:".length).toLowerCase() : null;
  return all.find((row) => row.id === key || (byEmail !== null && row.email.toLowerCase() === byEmail)) ?? null;
}
