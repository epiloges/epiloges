import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatDate } from "@/lib/format";
import { getPublishedPosts, getNavigation, getPublishedPostBySlug, getSeoDefaults, getSiteSettings } from "@/services";
import { JsonLd } from "@/components/shared/JsonLd";
import { Markdown } from "@/components/shared/Markdown";
import { blogPostingSchema, buildMetadata } from "@/lib/seo";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface JournalPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: JournalPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [post, seo, locale] = await Promise.all([getPublishedPostBySlug(slug), getSeoDefaults(), getLocale()]);
  if (!post) return {};
  // Canonical, social card and og:locale like every other page — this one returned a bare
  // title and description, so a shared post previewed with no image.
  return buildMetadata({ seo, title: post.title, description: post.excerpt, path: `/journal/${post.slug}`, image: post.coverImage.src, locale: locale as Locale });
}

export default async function JournalPostPage({ params }: JournalPostPageProps) {
  const t = await getTranslations("Pages");
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const [navigation, settings, seo] = await Promise.all([getNavigation(), getSiteSettings(), getSeoDefaults()]);

  return (
    <>
      <JsonLd data={blogPostingSchema(post, seo)} />
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <div className="container-luxe max-w-3xl py-10 md:py-14">
          <Link href="/journal" className="flex items-center gap-1.5 text-xs text-luxe-gray-dark hover:text-luxe-black">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} />
            {t("journalTitle")}
          </Link>

          <p className="mt-6 text-eyebrow">
            {formatDate(post.publishedAt)} &middot; {post.author}
          </p>
          <h1 className="mt-2 font-heading text-4xl md:text-5xl">{post.title}</h1>

          <div className="relative mt-8 aspect-16/9 w-full overflow-hidden bg-luxe-gray-light">
            <Image src={post.coverImage.src} alt={post.coverImage.alt} fill sizes="768px" className="object-cover" preload fetchPriority="high" />
          </div>

          <p className="mt-8 text-lg text-luxe-gray-dark">{post.excerpt}</p>
          {post.content ? <Markdown source={post.content} className="mt-2" /> : null}

          {post.tags.length > 0 ? (
            <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-6">
              {post.tags.map((tag) => (
                <span key={tag} className="border border-border px-2.5 py-1 text-xs text-luxe-gray-dark capitalize">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
