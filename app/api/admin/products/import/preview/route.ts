import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse, invalidInputResponse } from "@/lib/commerce/http-errors";
import { productFormSchema } from "@/lib/validation/product";
import { parseProductsCsv } from "@/lib/products-import/csv";
import { mapCsvRowToProductForm } from "@/lib/products-import/mapper";
import { uploadImageToBlob } from "@/lib/blob";
import { categorySlugFor } from "@/services/categories";
import { createMediaAsset } from "@/services/media";
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

    const imageFiles = form.getAll("images").filter((value): value is File => value instanceof File);
    const resolvedImageUrls = new Map<string, string>();
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

    const csvText = await csvFile.text();
    const { rows, parseErrors } = parseProductsCsv(csvText);
    if (rows.length === 0) {
      return invalidInputResponse(parseErrors[0] ?? "The CSV file has no data rows.");
    }

    const results: ImportRowResult[] = [];
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
      const rowParseErrors = index === 0 ? parseErrors : [];
      const { values: mapped, errors: mapErrors } = mapCsvRowToProductForm(row, resolvedImageUrls);

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
