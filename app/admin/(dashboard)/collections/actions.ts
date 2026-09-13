"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { capabilityDenied, requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { getHomepageConfig } from "@/services/homepage";
import { getNavigation } from "@/services/navigation";
import { collectionFormSchema, type CollectionFormValues } from "@/lib/validation/collection";
import { normalizeSeoOverride } from "@/lib/validation/product";

export interface CollectionActionState {
  error?: string;
}

/** Same rationale as products/actions.ts — nothing in this phase can compute the precise set of affected storefront pages. */
function revalidateStorefront() {
  revalidatePath("/", "layout");
}

function toCollectionWriteData(data: CollectionFormValues) {
  return {
    slug: data.slug,
    title: data.title,
    subtitle: data.subtitle ?? null,
    description: data.description ?? null,
    image: data.image,
    ctaLabel: data.ctaLabel ?? null,
    ctaHref: data.ctaHref ?? null,
    ctaVariant: data.ctaVariant ?? null,
    // Blank-but-present fields are collapsed away rather than stored as empty strings —
    // see normalizeSeoOverride for why "" is not the same as absent, and why the empty
    // case must be DbNull rather than undefined (which would leave the old value in place).
    seo: normalizeSeoOverride(data.seo) ?? Prisma.DbNull,
  };
}

export async function createCollection(values: CollectionFormValues): Promise<CollectionActionState> {
  const denied = await capabilityDenied("catalog:edit");
  if (denied) return { error: denied };
  const parsed = collectionFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await prisma.collection.findUnique({ where: { slug: data.slug } });
  if (existing) return { error: "A collection with this slug already exists." };

  const collection = await prisma.collection.create({
    data: {
      ...toCollectionWriteData(data),
      products: { create: data.productIds.map((productId, position) => ({ productId, position })) },
    },
  });

  await recordAdminAction({ action: "collection.created", targetType: "collection", targetId: collection.id, summary: `Created collection ${data.title} (${data.slug})` });
  revalidateStorefront();
  redirect(`/admin/collections/${collection.id}`);
}

export async function updateCollection(id: string, values: CollectionFormValues): Promise<CollectionActionState> {
  const denied = await capabilityDenied("catalog:edit");
  if (denied) return { error: denied };
  const parsed = collectionFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await prisma.collection.findUnique({ where: { slug: data.slug } });
  if (existing && existing.id !== id) return { error: "A collection with this slug already exists." };

  await prisma.$transaction([
    prisma.productCollection.deleteMany({ where: { collectionId: id } }),
    prisma.collection.update({
      where: { id },
      data: {
        ...toCollectionWriteData(data),
        products: { create: data.productIds.map((productId, position) => ({ productId, position })) },
      },
    }),
  ]);

  await recordAdminAction({ action: "collection.updated", targetType: "collection", targetId: id, summary: `Edited collection ${data.title} (${data.productIds.length} products)` });
  revalidateStorefront();
  redirect(`/admin/collections/${id}`);
}

/**
 * Refuses while the homepage or the navigation still points at the collection. Deleting it
 * anyway left a "featured collections" tile rendering nothing and menu links answering 404,
 * with no indication in the admin of why.
 */
export async function deleteCollection(id: string): Promise<CollectionActionState> {
  const denied = await capabilityDenied("catalog:delete");
  if (denied) return { error: denied };

  const collection = await prisma.collection.findUnique({ where: { id }, select: { slug: true, title: true } });
  if (!collection) return { error: "That collection no longer exists." };

  const [homepage, navigation] = await Promise.all([getHomepageConfig(), getNavigation()]);
  const usedBy: string[] = [];
  for (const section of homepage.sections) {
    if (section.type !== "featuredCollections") continue;
    const refs = section.data.tiles ?? (section.data.collectionIds ?? []).map((cid) => ({ type: "collection" as const, id: cid }));
    if (refs.some((ref) => ref.type === "collection" && ref.id === id)) usedBy.push("the homepage's featured collections");
  }
  const href = `/collections/${collection.slug}`;
  const navHrefs = [
    ...navigation.primary.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href), ...(item.featured ?? []).map((f) => f.href)]),
    ...navigation.utility.map((item) => item.href),
    ...navigation.footer.flatMap((column) => column.links.map((link) => link.href)),
  ];
  if (navHrefs.some((candidate) => candidate === href || candidate.startsWith(`${href}?`))) usedBy.push("the navigation menu");
  if (usedBy.length > 0) {
    return { error: `"${collection.title}" is still linked from ${usedBy.join(" and ")} — remove it there first, or its tile and links would break.` };
  }

  await prisma.collection.delete({ where: { id } });
  await recordAdminAction({ action: "collection.deleted", targetType: "collection", targetId: id, summary: `Deleted collection ${collection.title} (${collection.slug})` });
  revalidateStorefront();
  redirect("/admin/collections");
}
