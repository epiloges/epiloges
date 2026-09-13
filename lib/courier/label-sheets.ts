import { PDFDocument } from "pdf-lib";

export interface SheetLayer {
  /** A single-page A4 PDF from ACS with the label in `slot`. */
  pdf: Uint8Array;
  /** 1 = top third, 2 = middle, 3 = bottom — the Start_Position the page was printed with. */
  slot: 1 | 2 | 3;
}

/**
 * Lays courier labels onto sheets.
 *
 * ACS returns one single-page A4 PDF per voucher, with the label drawn in whichever of
 * the three slots was asked for and the rest of the page blank. Three such pages, each
 * using a different slot, on one page are exactly the "three labels per A4 sheet" their
 * guide describes — ACS leaves the stacking to the caller.
 *
 * Each page is embedded CROPPED to its own third. ACS paints the whole page white before
 * the label, so overlaying the full pages leaves only the last one visible; the crop
 * keeps every label's white to its own slot.
 */
export async function overlaySheets(sheets: SheetLayer[][]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const layers of sheets) {
    if (layers.length === 0) continue;
    const sources = await Promise.all(layers.map((layer) => PDFDocument.load(layer.pdf)));
    const { width, height } = sources[0].getPage(0).getSize();
    const page = out.addPage([width, height]);
    for (const [i, layer] of layers.entries()) {
      const third = height / 3;
      const bottom = (3 - layer.slot) * third;
      const embedded = await out.embedPage(sources[i].getPage(0), { left: 0, bottom, right: width, top: bottom + third });
      page.drawPage(embedded, { x: 0, y: bottom });
    }
  }
  return out.save();
}

/** One PDF after another, every page kept — for thermal rolls, where each label is its own page. */
export async function concatPdfs(docs: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const doc of docs) {
    const source = await PDFDocument.load(doc);
    const pages = await out.copyPages(source, source.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}
