import { NextResponse } from "next/server";
import { getPublishedPostBySlug } from "@/services/blog";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  return NextResponse.json({ post: post ?? null });
}
