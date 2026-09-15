import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { put } from "@vercel/blob";

/**
 * Puts the 1984 archive photographs on the blob store and writes their URLs into
 * data/about.json.
 *
 *   npx tsx scripts/upload-about-photos.ts <folder>
 *
 * The folder holds three files; they are matched by shape, not name: the widest one is the
 * shelf (the hero), and of the two portraits the taller-narrower is the first window, the
 * other the mirrored window. Override with --shelf=, --window=, --mirror= if the guess is
 * wrong. Each is resized to at most 2400px on the long side and saved as JPEG at 85 —
 * enough for a full-width hero, a fraction of a raw scan — and NOT otherwise touched: the
 * colour of a 1984 print is the point.
 */
const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const named = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));

async function main() {
  if (!folder || !fs.existsSync(folder)) {
    console.error("\n  Usage: npx tsx scripts/upload-about-photos.ts <folder> [--shelf=file --window=file --mirror=file]\n");
    process.exitCode = 1;
    return;
  }
  const files = fs
    .readdirSync(folder)
    .filter((f) => /\.(jpe?g|png|tiff?|webp)$/i.test(f))
    .map((f) => path.join(folder, f));
  if (files.length < 3) throw new Error(`Expected three photographs in ${folder}, found ${files.length}.`);

  const shaped = await Promise.all(
    files.map(async (file) => {
      const meta = await sharp(file).metadata();
      return { file, w: meta.width ?? 0, h: meta.height ?? 0, ratio: (meta.width ?? 1) / (meta.height ?? 1) };
    })
  );
  shaped.sort((a, b) => b.ratio - a.ratio);
  const guess = {
    shelf: shaped[0].file,
    window: shaped[shaped.length - 1].file,
    mirror: shaped[1].file,
  };
  const pick = (key: keyof typeof guess) => (named[key] ? path.join(folder, named[key]) : guess[key]);

  const slots: { key: keyof typeof guess; placeholder: string }[] = [
    { key: "shelf", placeholder: "ABOUT_SHELF_URL" },
    { key: "window", placeholder: "ABOUT_WINDOW_URL" },
    { key: "mirror", placeholder: "ABOUT_MIRROR_URL" },
  ];

  let json = fs.readFileSync("data/about.json", "utf8");
  for (const slot of slots) {
    const file = pick(slot.key);
    const buf = await sharp(file).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    const blob = await put(`about/1984-${slot.key}.jpg`, buf, { access: "public", contentType: "image/jpeg", addRandomSuffix: true });
    console.log(`  ${slot.key.padEnd(7)} ${path.basename(file)}  →  ${blob.url}  (${Math.round(buf.length / 1024)} KB)`);
    json = json.split(slot.placeholder).join(blob.url);
    // A re-run replaces an earlier upload's URL too, so the JSON never points at two generations.
    json = json.replace(new RegExp(`https://[^"]+/about/1984-${slot.key}-[^"]+\\.jpg`, "g"), blob.url);
  }
  fs.writeFileSync("data/about.json", json);
  console.log("\n  data/about.json updated.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
