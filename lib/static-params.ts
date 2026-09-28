/**
 * With Cache Components, a `generateStaticParams` that returns `[]` fails the whole build
 * ("must return at least one result"). That happens for real here: the shop launched with the
 * demo blog posts hidden and no product published yet, and the deploy broke on /journal/[slug].
 *
 * The documented escape hatch is one placeholder param that the page answers with notFound().
 * Every dynamic page here already calls notFound() for an unknown slug, so the placeholder
 * renders as a 404 and never appears in the sitemap or anywhere a shopper can reach.
 */
export const PLACEHOLDER_SLUG = "__placeholder__";

export function atLeastOneSlug<T extends { slug: string }>(params: T[]): { slug: string }[] {
  return params.length > 0 ? params : [{ slug: PLACEHOLDER_SLUG }];
}
