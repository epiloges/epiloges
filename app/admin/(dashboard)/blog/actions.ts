"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { createPost, deletePost, updatePost, BLOG_CACHE_TAG } from "@/services/blog";
import { blogFormSchema, type BlogFormValues } from "@/lib/validation/blog";

export interface BlogActionState {
  error?: string;
}

function revalidateStorefront() {
  revalidatePath("/", "layout");
  updateTag(BLOG_CACHE_TAG);
}

export async function createBlogPost(values: BlogFormValues): Promise<BlogActionState> {
  await requireCapability("content:blog");
  const parsed = blogFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { error: "A post with this slug already exists." };

  const post = await createPost(parsed.data);
  await recordAdminAction({ action: "blogPost.created", targetType: "blogPost", targetId: post.id, summary: `Created post "${parsed.data.title}" (${parsed.data.slug})` });
  revalidateStorefront();
  redirect(`/admin/blog/${post.id}`);
}

export async function updateBlogPost(id: string, values: BlogFormValues): Promise<BlogActionState> {
  await requireCapability("content:blog");
  const parsed = blogFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } });
  if (existing && existing.id !== id) return { error: "A post with this slug already exists." };

  await updatePost(id, parsed.data);
  await recordAdminAction({ action: "blogPost.updated", targetType: "blogPost", targetId: id, summary: `Edited post "${parsed.data.title}" (${parsed.data.slug})` });
  revalidateStorefront();
  redirect(`/admin/blog/${id}`);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await requireCapability("content:blog");
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { title: true, slug: true } });
  await deletePost(id);
  await recordAdminAction({ action: "blogPost.deleted", targetType: "blogPost", targetId: id, summary: `Deleted post "${post?.title ?? id}"`, metadata: { slug: post?.slug } });
  revalidateStorefront();
  redirect("/admin/blog");
}
