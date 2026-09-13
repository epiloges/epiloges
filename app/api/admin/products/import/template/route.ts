import { connection } from "next/server";
import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";
import { buildImportTemplateCsv } from "@/lib/products-import/columns";

/** A CSV with every column the import understands and one example row. */
export async function GET() {
  // A GET with no dynamic read is attempted as a prerender at build; the session cookie is
  // only readable per request. Mark the route dynamic before touching it.
  await connection();
  try {
    await requireCapability("catalog:edit");
    // The BOM is for Excel, which otherwise opens Greek text as mojibake.
    return new Response(`\uFEFF${buildImportTemplateCsv()}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="alexandris-product-import-template.csv"',
      },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
