import "server-only";
import Papa from "papaparse";

export type RawCsvRow = Record<string, string>;

/**
 * Thin papaparse wrapper (header mode) — added specifically because a naive
 * `.split(",")` mis-parses any product description/name containing a comma or an
 * embedded newline inside a quoted cell. `errors` here are file-level parse problems
 * (e.g. inconsistent column counts), not product-field validation, which happens later
 * via productFormSchema against the mapped row.
 */
/**
 * The CSV's text, whichever way Excel saved it.
 *
 * "CSV UTF-8" is one of Excel's save options; plain "CSV (comma delimited)", the one listed
 * first, writes the machine's legacy code page — Windows-1253 on a Greek PC. Read as UTF-8,
 * every Greek name in that file became replacement characters, and the rows still validated,
 * so products imported with names like "���������". UTF-8 is tried strictly first; anything
 * that isn't valid UTF-8 is read as Windows-1253, which is also a superset of plain ASCII.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1253").decode(bytes);
  }
}

export function parseProductsCsv(csvText: string): { rows: RawCsvRow[]; parseErrors: string[] } {
  const result = Papa.parse<RawCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  const parseErrors = result.errors.map((error) => `Row ${error.row ?? "?"}: ${error.message}`);
  return { rows: result.data, parseErrors };
}
