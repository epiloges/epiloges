import { NextResponse } from "next/server";
import { getPublishedPosts } from "@/services/blog";

export async function GET() {
  const posts = await getPublishedPosts();
  return NextResponse.json({ posts });
}
