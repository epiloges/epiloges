import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getSeoDefaults } from "@/services/seo";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getAboutPage, getNavigation, getSiteSettings } from "@/services";
import { cn } from "@/lib/utils";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const [seo, t, locale] = await Promise.all([getSeoDefaults(), getTranslations("Pages"), getLocale()]);
  return buildMetadata({ seo, title: t("aboutTitle"), description: t("aboutDescription"), path: "/about", locale: locale as Locale });
}

/**
 * The story, told with the shop's own photographs from 1984 rather than stock. The page
 * is a sequence, not a template: a full-height archive photograph under the title, the
 * founding chapter beside the first window, a black band with the four facts, the second
 * generation beside the mirrored window, three short pieces of prose, and the closing
 * line signed with the wordmark. Everything on it comes from data/about.json.
 */
export default async function AboutPage() {
  const [navigation, settings, about] = await Promise.all([getNavigation(), getSiteSettings(), getAboutPage()]);

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        {/* Hero: the founder in front of the first shop, shown as the print it is. The
            archive photographs are small — stretched across a screen they would blur — so
            the picture sits framed on black at the size a print would hang, and the title
            takes the room beneath it. */}
        <section className="bg-luxe-black py-12 text-luxe-white md:py-20">
          <div className="container-luxe">
            <figure className="mx-auto max-w-2xl">
              <div className="relative aspect-[1320/1295] w-full overflow-hidden bg-luxe-gray-dark p-2 md:p-3">
                <div className="relative h-full w-full bg-luxe-white p-2 md:p-3">
                  <div className="relative h-full w-full overflow-hidden">
                    <Image src={about.heroImage.src} alt={about.heroImage.alt} fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" preload fetchPriority="high" />
                  </div>
                </div>
              </div>
              {about.heroCaption ? (
                <figcaption className="mt-3 text-center text-[11px] tracking-[0.2em] uppercase text-luxe-white/60">{about.heroCaption}</figcaption>
              ) : null}
            </figure>
            <div className="mx-auto mt-10 max-w-3xl text-center md:mt-14">
              <p className="text-[11px] tracking-[0.3em] uppercase text-luxe-white/70">{about.eyebrow}</p>
              <h1 className="mt-4 font-heading text-4xl leading-[1.05] md:text-6xl">{about.title}</h1>
            </div>
          </div>
        </section>

        {/* Intro: one sentence, large, alone. */}
        <section className="container-luxe py-16 md:py-24">
          <p className="mx-auto max-w-3xl text-center font-heading text-2xl leading-snug text-luxe-black md:text-3xl">{about.intro}</p>
        </section>

        {/* Chapters: photograph and prose side by side, alternating sides. */}
        {about.chapters.map((chapter, index) => (
          <Chapter key={chapter.heading} chapter={chapter} reverse={index % 2 === 1} />
        ))}

        {/* The statement band between the chapters' halves would split the story; it goes
            after them, as the summary of what the two chapters just told. */}
        <section className="bg-luxe-black py-16 text-luxe-white md:py-24">
          <div className="container-luxe">
            <p className="mx-auto max-w-4xl text-center font-heading text-3xl leading-tight md:text-5xl">{about.statement.line}</p>
            <dl className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-10 text-center md:grid-cols-4">
              {about.statement.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="order-2 mt-2 text-[11px] tracking-[0.25em] uppercase text-luxe-white/60">{fact.label}</dt>
                  <dd className="font-heading text-4xl md:text-5xl">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* One more photograph before the prose — the shelf, the same frame as the hero. */}
        {about.interlude ? (
          <section className="container-luxe pt-16 md:pt-24">
            <figure className="mx-auto max-w-3xl">
              <div className="relative aspect-[598/402] w-full overflow-hidden bg-luxe-gray-light p-2 md:p-3">
                <div className="relative h-full w-full bg-luxe-white p-2 md:p-3">
                  <div className="relative h-full w-full overflow-hidden">
                    <Image src={about.interlude.image.src} alt={about.interlude.image.alt} fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
                  </div>
                </div>
              </div>
              {about.interlude.caption ? (
                <figcaption className="mt-3 text-center text-[11px] tracking-[0.2em] uppercase text-luxe-gray-dark">{about.interlude.caption}</figcaption>
              ) : null}
            </figure>
          </section>
        ) : null}

        {/* Prose: three short pieces in one measure. */}
        <section className="container-luxe py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-3 md:gap-10">
            {about.sections.map((section) => (
              <div key={section.heading}>
                <h2 className="font-heading text-xl md:text-2xl">{section.heading}</h2>
                <p className="mt-4 text-sm leading-relaxed text-luxe-gray-dark">{section.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing: the line, the signature under the wordmark, two ways onward. */}
        <section className="border-t border-border">
          <div className="container-luxe py-20 text-center md:py-28">
            <p className="mx-auto max-w-3xl font-heading text-2xl leading-snug md:text-4xl">{about.closing.quote}</p>
            <p className="mt-10 font-heading text-lg tracking-[0.35em] uppercase">Alexandris</p>
            <p className="mt-2 text-sm text-luxe-gray-dark">{about.closing.signature}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href={about.closing.cta.href}
                className="inline-flex h-12 items-center bg-luxe-black px-8 text-xs font-medium tracking-[0.15em] text-luxe-white uppercase transition-opacity hover:opacity-90"
              >
                {about.closing.cta.label}
              </Link>
              {about.closing.secondary ? (
                <Link
                  href={about.closing.secondary.href}
                  className="inline-flex h-12 items-center border border-luxe-black px-8 text-xs font-medium tracking-[0.15em] uppercase transition-colors hover:bg-luxe-black hover:text-luxe-white"
                >
                  {about.closing.secondary.label}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}

function Chapter({
  chapter,
  reverse,
}: {
  chapter: { eyebrow: string; heading: string; body: string; image: { src: string; alt: string }; caption?: string };
  reverse: boolean;
}) {
  return (
    <section className="container-luxe pb-16 md:pb-24">
      <div className={cn("grid items-center gap-10 md:grid-cols-12 md:gap-14", reverse && "md:[&>*:first-child]:order-2")}>
        <figure className="md:col-span-6">
          {/* The scans are portrait; the frame keeps that and leaves the photograph
              untouched — no crop into the shoes, no colour correction of the 1984 print. */}
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-luxe-gray-light">
            <Image src={chapter.image.src} alt={chapter.image.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
          {chapter.caption ? (
            <figcaption className="mt-3 text-[11px] tracking-[0.2em] uppercase text-luxe-gray-dark">{chapter.caption}</figcaption>
          ) : null}
        </figure>
        <div className="md:col-span-6 md:px-6">
          <p className="text-[11px] tracking-[0.3em] uppercase text-luxe-gray-dark">{chapter.eyebrow}</p>
          <h2 className="mt-4 font-heading text-3xl md:text-4xl">{chapter.heading}</h2>
          <p className="mt-6 text-base leading-relaxed text-luxe-gray-dark md:text-lg">{chapter.body}</p>
        </div>
      </div>
    </section>
  );
}
