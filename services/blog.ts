import "server-only";
import { prisma } from "@/lib/prisma";
import { imageSchema } from "@/lib/validation/product";
import { toJsonInput } from "@/lib/commerce/postgres/mappers";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { BlogPost } from "@/types";

function toBlogPost(row: Prisma.BlogPostGetPayload<object>): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content ?? undefined,
    coverImage: imageSchema.parse(row.coverImage),
    author: row.author,
    tags: row.tags,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const rows = await prisma.blogPost.findMany({ orderBy: { publishedAt: "desc" } });
  return rows.map(toBlogPost);
}

/**
 * What the storefront shows: posts whose publish date has arrived. Every post used to be
 * live the moment it was saved, and a future date showed immediately — so there was no
 * way to write a post ahead or to schedule one. A future `publishedAt` is now a schedule:
 * the admin list marks it "Scheduled", the journal shows it from that day. `getAllPosts`
 * stays for the admin, which must see everything.
 */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const rows = await prisma.blogPost.findMany({ where: { publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" } });
  return rows.map(toBlogPost);
}

export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const row = await prisma.blogPost.findFirst({ where: { slug, publishedAt: { lte: new Date() } } });
  return row ? toBlogPost(row) : undefined;
}

export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const row = await prisma.blogPost.findUnique({ where: { slug } });
  return row ? toBlogPost(row) : undefined;
}

export async function getPostById(id: string): Promise<BlogPost | undefined> {
  const row = await prisma.blogPost.findUnique({ where: { id } });
  return row ? toBlogPost(row) : undefined;
}

export interface BlogPostInput {
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  coverImage: BlogPost["coverImage"];
  author: string;
  tags: string[];
  publishedAt: string;
}

export async function createPost(input: BlogPostInput): Promise<BlogPost> {
  const row = await prisma.blogPost.create({
    data: {
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      coverImage: toJsonInput(imageSchema.parse(input.coverImage)),
      author: input.author,
      tags: input.tags,
      publishedAt: new Date(input.publishedAt),
    },
  });
  return toBlogPost(row);
}

export async function updatePost(id: string, input: BlogPostInput): Promise<BlogPost> {
  const row = await prisma.blogPost.update({
    where: { id },
    data: {
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      coverImage: toJsonInput(imageSchema.parse(input.coverImage)),
      author: input.author,
      tags: input.tags,
      publishedAt: new Date(input.publishedAt),
    },
  });
  return toBlogPost(row);
}

export async function deletePost(id: string): Promise<void> {
  await prisma.blogPost.delete({ where: { id } });
}
