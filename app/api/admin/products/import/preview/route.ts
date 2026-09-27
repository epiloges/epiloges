import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse, invalidInputResponse } from "@/lib/commerce/http-errors";
import { productFormSchema } from "@/lib/validation/product";
import { decodeCsvBytes, parseProductsCsv } from "@/lib/products-import/csv";
import { mapCsvRowToProductForm } from "@/lib/products-import/mapper";
import { uploadImageToBlob } from "@/lib/blob";
import { categorySlugFor } from "@/services/categories";
import { createMediaAsset } from "@/services/media";
import { deriveSizeSku, generateSku } from "@/lib/sku";
import { generateProductDescription } from "@/lib/seo/product-content";
import { detectBrand } from "@/lib/seo/brands";
import type { ImportRowResult } from "@/lib/products-import/types";

/**
 * Parses the CSV, uploads any accompanying image files to Blob, validates every row
 * against the same productFormSchema the single-product admin form uses, and checks
 * slug collisions — but writes nothing to the database yet. The confirmed row list
 * (including already-uploaded Blob URLs, so nothing re-uploads) comes back to the
 * browser and is re-submitted verbatim to the commit route.
 */
export async function POST(request: Request) {
  try {
    // Same capability as the commit route: preview already uploads images to Blob and
    // creates MediaAsset rows, so it is a write path too, not a read-only dry run.
    await requireCapability("catalog:edit");

    const form = await request.formData();
    const csvFile = form.get("csv");
    if (!(csvFile instanceof File)) return invalidInputResponse("No CSV file was provided.");

    const resolvedImageUrls = new Map<string, string>();

    // The form uploads images first, one per request (components/admin/upload-images.ts), and
    // sends only the filename → URL map here. Files in this request are still accepted below,
    // but any real batch of them exceeds Vercel's 4.5 MB request limit.
    const imageUrlsField = form.get("imageUrls");
    if (typeof imageUrlsField === "string" && imageUrlsField.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(imageUrlsField);
      } catch {
        return invalidInputResponse("The image list was malformed.");
      }
      if (parsed && typeof parsed === "object") {
        for (const [name, url] of Object.entries(parsed as Record<string, unknown>)) {
          // https for Blob storage; a site-relative /uploads path is the local-dev fallback (lib/blob.ts).
          if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("/uploads/"))) resolvedImageUrls.set(name.toLowerCase(), url);
        }
      }
    }

    const imageFiles = form.getAll("images").filter((value): value is File => value instanceof File);
    for (const file of imageFiles) {
      const blob = await uploadImageToBlob(file);
      // Recorded in the Media Library too, so images arriving via a bulk import are
      // manageable afterwards rather than existing only inside a product's images array.
      await createMediaAsset({
        url: blob.url,
        pathname: blob.pathname,
        filename: file.name,
        contentType: blob.contentType ?? file.type ?? undefined,
        sizeBytes: Number.isFinite(file.size) ? file.size : undefined,
        folder: "imports",
      });
      resolvedImageUrls.set(file.name.toLowerCase(), blob.url);
    }

    const csvText = decodeCsvBytes(await csvFile.arrayBuffer());
    const { rows, parseErrors } = parseProductsCsv(csvText);
    if (rows.length === 0) {
      return invalidInputResponse(parseErrors[0] ?? "The CSV file has no data rows.");
    }

    const results: ImportRowResult[] = [];
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
      const rowParseErrors = index === 0 ? parseErrors : [];
      const { values: mapped, errors: mapErrors } = mapCsvRowToProductForm(row, resolvedImageUrls);

      // SKU and description are optional in the sheet, as on the product form. A row that
      // updates an existing product keeps that product's SKU rather than being given a new one.
      if (!mapped.sku && typeof mapped.slug === "string" && mapped.slug) {
        const existingSku = await prisma.product.findUnique({ where: { slug: mapped.slug }, select: { sku: true } });
        mapped.sku = existingSku?.sku ?? generateSku(mapped.slug);
      }
      // Per-size codes the same way the product form writes them: SKU-36, SKU-37 …
      if (typeof mapped.sku === "string" && mapped.sku && Array.isArray(mapped.sizes)) {
        for (const size of mapped.sizes as { name: string; sku?: string }[]) {
          if (!size.sku) size.sku = deriveSizeSku(mapped.sku as string, size.name) ?? undefined;
        }
      }
      if (!mapped.description && typeof mapped.name === "string" && mapped.name) {
        mapped.description = generateProductDescription({
          name: mapped.name,
          brand: detectBrand(mapped.name) ?? undefined,
          sizes: (mapped.sizes as { name: string }[]).map((size) => size.name),
          categorySlug: typeof mapped.category === "string" ? categorySlugFor(mapped.category) : undefined,
        });
      }

      const parsed = productFormSchema.safeParse(mapped);
      const schemaErrors = parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      const errors = [...rowParseErrors, ...mapErrors, ...schemaErrors];

      if (errors.length > 0 || !parsed.success) {
        results.push({ rowNumber, values: null, errors });
        continue;
      }

      const [existing, category] = await Promise.all([
        prisma.product.findUnique({ where: { slug: parsed.data.slug }, select: { id: true, status: true } }),
        prisma.category.findUnique({ where: { slug: categorySlugFor(parsed.data.category) }, select: { id: true } }),
      ]);
      /**
       * Every warning here is something the row will DO that the admin may not have meant:
       * overwrite a product (including republishing an archived one), invent a category
       * from a typo, or publish. None blocks the import — the point is that the preview
       * says it before the commit does it.
       */
      const warnings: string[] = [];
      if (existing) {
        warnings.push(
          existing.status !== "active" && parsed.data.status === "active"
            ? `A ${existing.status} product with this slug already exists — this row will update it AND publish it.`
            : "A product with this slug already exists — this row will update it."
        );
      }
      if (!category) {
        warnings.push(
          `Category "${parsed.data.category}" doesn't exist. It will be created hidden, with an English name and no Greek one — rename it under Categories, or fix the cell if it's a typo.`
        );
      }
      if (parsed.data.status === "active" && !existing) warnings.push("Will be published to the storefront on import.");
      results.push({
        rowNumber,
        values: parsed.data,
        errors: [],
        warning: warnings.length > 0 ? warnings.join(" ") : undefined,
        existingId: existing?.id,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
