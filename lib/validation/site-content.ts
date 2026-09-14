import { z } from "zod";

/**
 * Schemas for everything the admin saves through `setSiteContent` — shipping rates,
 * navigation, the homepage, site settings and SEO defaults.
 *
 * None of these had a server-side check until now. The Server Actions took a TypeScript
 * type, which is a promise about the client and nothing else: the shipping form's
 * `min={0}` was the only thing standing between an admin and a delivery rate of −5 €
 * (which lowers the order total) or a free-shipping threshold of −50 (everything free),
 * and the hero could be published with no image and no headline. Each schema here is
 * the smallest rule set that keeps the storefront coherent — not a redesign of the shape.
 *
 * Shared with the forms through the actions' `{ error }` results rather than zodResolver,
 * because these editors are plain useState forms, not react-hook-form.
 */

/** Money the shop will show a customer: two decimals, never negative, never absurd. */
const money = z
  .number()
  .finite()
  .min(0, "Can't be negative")
  .max(100_000, "That's not a plausible amount")
  .refine((n) => Math.round(n * 100) === n * 100, "Use at most two decimal places");

/**
 * A link target the storefront may render. Site-relative paths, anchors, and http(s),
 * mailto and tel URLs. `javascript:` and `data:` are the point of the rule: React refuses
 * to follow a `javascript:` href, so the link would simply be broken for every visitor.
 */
export const safeHrefSchema = z
  .string()
  .trim()
  .min(1, "A link is required")
  .refine(
    (href) => /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(href),
    "Links must start with /, #, https://, mailto: or tel:"
  );

const optionalSafeHref = z.union([safeHrefSchema, z.literal("")]).optional();

const nonEmpty = (what: string) => z.string().trim().min(1, `${what} is required`);

const imageSchema = z.object({
  src: nonEmpty("An image"),
  alt: z.string().trim().default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  blurDataURL: z.string().optional(),
});

const ctaSchema = z.object({
  label: nonEmpty("A button label"),
  href: safeHrefSchema,
  variant: z.enum(["primary", "secondary", "ghost", "link"]).optional(),
});

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

const shippingRateSchema = z.object({
  id: nonEmpty("A rate id"),
  label: nonEmpty("The name shown to customers"),
  description: z.string().trim().default(""),
  estimatedDelivery: z.string().trim().default(""),
  amount: money,
  enabled: z.boolean(),
  freeShippingEligible: z.boolean(),
  remoteAreas: z
    .object({
      amount: money,
      postalCodes: z.array(z.string().trim().min(1)),
    })
    .optional(),
  scope: z.enum(["domestic", "international"]).optional(),
});

export const shippingSettingsSchema = z
  .object({
    freeShippingThreshold: z.union([money, z.null()]),
    rates: z.array(shippingRateSchema).min(1, "Keep at least one delivery method"),
  })
  .superRefine((settings, ctx) => {
    if (!settings.rates.some((rate) => rate.enabled)) {
      ctx.addIssue({
        code: "custom",
        path: ["rates"],
        message: "At least one delivery method must be available at checkout — with none, nobody can order.",
      });
    }
    const ids = new Set<string>();
    settings.rates.forEach((rate, index) => {
      if (ids.has(rate.id)) {
        ctx.addIssue({ code: "custom", path: ["rates", index, "id"], message: `Duplicate rate id "${rate.id}"` });
      }
      ids.add(rate.id);
    });
  });

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const navItemSchema: z.ZodType<{
  id: string;
  label: string;
  href: string;
  mobileOnly?: boolean;
  children?: unknown[];
  featured?: { title: string; image: string; href: string }[];
}> = z.lazy(() =>
  z.object({
    id: nonEmpty("An id"),
    label: nonEmpty("A menu label"),
    href: safeHrefSchema,
    mobileOnly: z.boolean().optional(),
    children: z.array(navItemSchema).optional(),
    featured: z
      .array(
        z.object({
          title: nonEmpty("A featured title"),
          image: z.string().trim().default(""),
          href: safeHrefSchema,
        })
      )
      .optional(),
  })
);

export const navigationConfigSchema = z.object({
  primary: z.array(navItemSchema).min(1, "The main menu needs at least one item"),
  utility: z.array(navItemSchema),
  footer: z.array(
    z.object({
      title: nonEmpty("A footer column title"),
      links: z.array(z.object({ label: nonEmpty("A link label"), href: safeHrefSchema })),
    })
  ),
});

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

const sectionBase = {
  id: nonEmpty("A section id"),
  enabled: z.boolean(),
  order: z.number().int(),
};

const heroSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("hero"),
  data: z.object({
    eyebrow: z.string().optional(),
    headline: nonEmpty("The hero headline"),
    subheadline: z.string().optional(),
    image: imageSchema,
    primaryCta: ctaSchema.optional(),
    secondaryCta: ctaSchema.optional(),
  }),
});

const featuredCollectionsSchema = z.object({
  ...sectionBase,
  type: z.literal("featuredCollections"),
  data: z.object({
    title: nonEmpty("A title"),
    subtitle: z.string().optional(),
    collectionIds: z.array(z.string()).optional(),
    tiles: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("collection"), id: z.string().min(1) }),
          z.object({ type: z.literal("category"), slug: z.string().min(1) }),
        ])
      )
      .optional(),
  }),
});

const bestSellersSchema = z.object({
  ...sectionBase,
  type: z.literal("bestSellers"),
  data: z.object({
    title: nonEmpty("A title"),
    subtitle: z.string().optional(),
    productIds: z.array(z.string()),
    viewAllCta: ctaSchema.optional(),
  }),
});

const editorialBannerSchema = z.object({
  ...sectionBase,
  type: z.literal("editorialBanner"),
  data: z.object({
    eyebrow: z.string().optional(),
    headline: nonEmpty("The banner headline"),
    body: z.string().optional(),
    image: imageSchema,
    cta: ctaSchema.optional(),
    imagePosition: z.enum(["left", "right"]).optional(),
  }),
});

const newArrivalsSchema = z.object({
  ...sectionBase,
  type: z.literal("newArrivals"),
  data: z.object({
    title: nonEmpty("A title"),
    subtitle: z.string().optional(),
    productIds: z.array(z.string()),
    rows: z
      .array(
        z.object({
          gender: z.enum(["women", "men"]),
          title: nonEmpty("A row title"),
          viewAllHref: safeHrefSchema,
          viewAllLabel: nonEmpty("A 'view all' label"),
        })
      )
      .optional(),
    limit: z.number().int().positive().max(48).optional(),
  }),
});

const brandStorySchema = z.object({
  ...sectionBase,
  type: z.literal("brandStory"),
  data: z.object({
    eyebrow: z.string().optional(),
    headline: nonEmpty("The story headline"),
    body: nonEmpty("The story text"),
    cta: ctaSchema.optional(),
  }),
});

const socialGridSchema = z.object({
  ...sectionBase,
  type: z.literal("socialGrid"),
  data: z.object({
    title: nonEmpty("A title"),
    handle: z.string().optional(),
    images: z.array(imageSchema),
  }),
});

const brandStripSchema = z.object({
  ...sectionBase,
  type: z.literal("brandStrip"),
  data: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    brands: z.array(
      z.object({
        name: nonEmpty("A brand name"),
        logo: z.string().optional(),
        logoAlt: z.string().optional(),
        href: optionalSafeHref,
      })
    ),
  }),
});

const newsletterSchema = z.object({
  ...sectionBase,
  type: z.literal("newsletter"),
  data: z.object({
    headline: nonEmpty("The newsletter headline"),
    subheadline: z.string().optional(),
    ctaLabel: nonEmpty("The button label"),
  }),
});

const categorySpotlightSchema = z.object({
  ...sectionBase,
  type: z.literal("categorySpotlight"),
  data: z.object({
    categorySlug: nonEmpty("The category slug"),
    eyebrow: z.string().optional(),
    headline: z.string().optional(),
    ctaLabel: nonEmpty("The link label"),
    limit: z.number().int().min(1).max(24).optional(),
  }),
});

export const homepageSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  featuredCollectionsSchema,
  bestSellersSchema,
  editorialBannerSchema,
  newArrivalsSchema,
  brandStorySchema,
  socialGridSchema,
  brandStripSchema,
  newsletterSchema,
  categorySpotlightSchema,
]);

export const homepageSectionsSchema = z.array(homepageSectionSchema).superRefine((sections, ctx) => {
  const ids = new Set<string>();
  sections.forEach((section, index) => {
    if (ids.has(section.id)) {
      ctx.addIssue({ code: "custom", path: [index, "id"], message: `Duplicate section id "${section.id}"` });
    }
    ids.add(section.id);
  });
});

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export const siteSettingsSchema = z.object({
  siteName: nonEmpty("The site name").max(80, "Keep the site name under 80 characters"),
  tagline: z.string().trim().default(""),
  logo: z.string().trim().default(""),
  logoDark: z.string().trim().optional(),
  favicon: z.string().trim().default(""),
  contactEmail: z.string().trim().email("Enter a valid contact email address"),
  // ISO 4217 — three upper-case letters. Stored upper-cased so "eur" and "EUR" are one thing.
  currency: z
    .string()
    .trim()
    .transform((code) => code.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code such as EUR")),
  locale: z.string().trim().min(2),
  socialLinks: z.array(
    z.object({
      platform: z.enum(["instagram", "facebook", "tiktok", "pinterest", "youtube", "x"]),
      url: z.string().trim().url("Social links must be full URLs"),
    })
  ),
  // Blank rows are dropped rather than rejected: an empty announcement slot is a slip of
  // the "Add message" button, and it would otherwise rotate an empty bar on the storefront.
  announcementMessages: z
    .array(z.string().trim())
    .transform((messages) => messages.filter(Boolean))
    .pipe(z.array(z.string().max(160, "Keep announcements under 160 characters"))),
});

// ---------------------------------------------------------------------------
// SEO defaults
// ---------------------------------------------------------------------------

export const siteSeoDefaultsSchema = z.object({
  titleTemplate: nonEmpty("The title template").refine((t) => t.includes("%s"), "The title template must contain %s"),
  defaultTitle: nonEmpty("The default title"),
  defaultDescription: nonEmpty("The default description"),
  siteUrl: z
    .string()
    .trim()
    .url("The site URL must be a full URL")
    .refine((url) => url.startsWith("https://") || url.startsWith("http://localhost"), "The site URL must use https://")
    .transform((url) => url.replace(/\/+$/, "")),
  defaultOgImage: z.string().trim().optional(),
  twitterHandle: z.string().trim().optional(),
  organization: z.object({
    name: nonEmpty("The organisation name"),
    logo: z.string().trim().default(""),
    sameAs: z.array(z.string().trim().url("Organisation links must be full URLs")),
  }),
});

/** The first issue, phrased with its path so an admin can find the field. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const path = issue.path.filter((segment) => typeof segment === "string").join(" › ");
  return path ? `${path}: ${issue.message}` : issue.message;
}
