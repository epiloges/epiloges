import { describe, expect, it } from "vitest";
import {
  firstIssueMessage,
  homepageSectionsSchema,
  navigationConfigSchema,
  safeHrefSchema,
  shippingSettingsSchema,
  siteSettingsSchema,
} from "@/lib/validation/site-content";

const rate = {
  id: "standard",
  label: "Παράδοση κατ' οίκον",
  description: "",
  estimatedDelivery: "",
  amount: 4.95,
  enabled: true,
  freeShippingEligible: true,
};

describe("shippingSettingsSchema", () => {
  it("accepts the live shape", () => {
    expect(shippingSettingsSchema.safeParse({ freeShippingThreshold: 150, rates: [rate] }).success).toBe(true);
    expect(shippingSettingsSchema.safeParse({ freeShippingThreshold: null, rates: [rate] }).success).toBe(true);
  });

  it("refuses what the audit saved", () => {
    const negative = shippingSettingsSchema.safeParse({ freeShippingThreshold: -50, rates: [{ ...rate, amount: -5, label: "" }] });
    expect(negative.success).toBe(false);
    if (!negative.success) expect(firstIssueMessage(negative.error)).toMatch(/negative/);
  });

  it("refuses a checkout with no delivery method", () => {
    const result = shippingSettingsSchema.safeParse({ freeShippingThreshold: null, rates: [{ ...rate, enabled: false }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssueMessage(result.error)).toMatch(/nobody can order/);
  });

  it("refuses fractions of a cent", () => {
    expect(shippingSettingsSchema.safeParse({ freeShippingThreshold: null, rates: [{ ...rate, amount: 4.999 }] }).success).toBe(false);
  });
});

describe("safeHrefSchema", () => {
  it("allows site paths, anchors, https, mailto and tel", () => {
    for (const href of ["/women", "#top", "https://example.com/x", "mailto:a@b.gr", "tel:+30210"]) {
      expect(safeHrefSchema.safeParse(href).success).toBe(true);
    }
  });

  it("refuses javascript:, data:, protocol-relative and bare words", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "women", ""]) {
      expect(safeHrefSchema.safeParse(href).success).toBe(false);
    }
  });
});

describe("homepageSectionsSchema", () => {
  const hero = {
    id: "sec-hero",
    type: "hero",
    enabled: true,
    order: 0,
    data: { headline: "Νέα σεζόν", image: { src: "https://x/y.jpg", alt: "" }, primaryCta: { label: "Γυναικεία", href: "/women" } },
  };

  it("refuses a hero with no image or headline", () => {
    expect(homepageSectionsSchema.safeParse([{ ...hero, data: { ...hero.data, image: { src: "", alt: "" } } }]).success).toBe(false);
    expect(homepageSectionsSchema.safeParse([{ ...hero, data: { ...hero.data, headline: "  " } }]).success).toBe(false);
    expect(homepageSectionsSchema.safeParse([hero]).success).toBe(true);
  });

  it("refuses a javascript: call to action", () => {
    const result = homepageSectionsSchema.safeParse([{ ...hero, data: { ...hero.data, primaryCta: { label: "x", href: "javascript:alert(1)" } } }]);
    expect(result.success).toBe(false);
  });
});

describe("navigationConfigSchema", () => {
  it("requires labels and safe links", () => {
    const ok = navigationConfigSchema.safeParse({ primary: [{ id: "1", label: "Γυναικεία", href: "/women" }], utility: [], footer: [] });
    expect(ok.success).toBe(true);
    const blank = navigationConfigSchema.safeParse({ primary: [{ id: "1", label: "", href: "/women" }], utility: [], footer: [] });
    expect(blank.success).toBe(false);
  });
});

describe("siteSettingsSchema", () => {
  const settings = {
    siteName: "ALEXANDRIS",
    tagline: "",
    logo: "/logo.svg",
    favicon: "/favicon.ico",
    contactEmail: "shop@example.gr",
    currency: "eur",
    locale: "el-GR",
    socialLinks: [],
    announcementMessages: ["Δωρεάν αποστολή", "  ", ""],
  };

  it("keeps the brand on the header and drops blank announcements", () => {
    const parsed = siteSettingsSchema.safeParse(settings);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.currency).toBe("EUR");
      expect(parsed.data.announcementMessages).toEqual(["Δωρεάν αποστολή"]);
    }
    expect(siteSettingsSchema.safeParse({ ...settings, siteName: "" }).success).toBe(false);
    expect(siteSettingsSchema.safeParse({ ...settings, currency: "€" }).success).toBe(false);
    expect(siteSettingsSchema.safeParse({ ...settings, contactEmail: "not-an-email" }).success).toBe(false);
  });
});
