/**
 * The one browser-side path every admin image upload goes through: the product form, the
 * Media Library, and the CSV import.
 *
 * Why it exists. Every selected file used to go to the server in ONE request, and Vercel
 * refuses any function request over 4.5 MB before our code runs. Three phone photos are
 * past that, so "choose files" failed as a batch — with a 413 whose body isn't JSON, which
 * the old code reported as "Is a Blob store connected?". The storefront never shows an
 * image wider than 1600px, so the originals were also mostly weight nobody sees.
 *
 * So each photo is (1) shrunk in the browser to at most {@link MAX_EDGE}px on its long
 * edge and re-encoded as WebP, turned the right way up from its EXIF orientation, then
 * (2) sent on its own request, a few at a time. One bad file no longer sinks the rest.
 */

export interface UploadedMedia {
  url: string;
  filename: string;
}

export interface UploadOutcome {
  media: UploadedMedia[];
  /** One readable line per file that didn't make it. */
  errors: string[];
}

export interface UploadOptions {
  folder?: string;
  /** Called after each file finishes, successfully or not. */
  onProgress?: (done: number, total: number) => void;
}

/** Long edge after resizing. Comfortably above the largest width the storefront renders (1600). */
const MAX_EDGE = 2400;
const WEBP_QUALITY = 0.88;
/** Anything already small and within MAX_EDGE is sent untouched. */
const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;
/** Kept under Vercel's 4.5 MB request cap with room for the multipart envelope. */
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const CONCURRENCY = 3;

export async function uploadMediaFiles(files: File[], options: UploadOptions = {}): Promise<UploadOutcome> {
  const media: UploadedMedia[] = new Array(files.length);
  const errors: string[] = [];
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < files.length) {
      const index = next++;
      const file = files[index];
      try {
        media[index] = await uploadOne(file, options.folder);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `"${file.name}" failed to upload.`);
      }
      options.onProgress?.(++done, files.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  // Upload order is the order the files were chosen in, which is the order they'll show on the product.
  return { media: media.filter(Boolean), errors };
}

async function uploadOne(original: File, folder?: string): Promise<UploadedMedia> {
  if (isHeic(original)) {
    throw new Error(
      `"${original.name}" is an iPhone HEIC photo, which browsers can't read. On the iPhone: Settings → Camera → Formats → Most Compatible, or export it as JPEG.`
    );
  }

  const prepared = await prepareImage(original);
  if (prepared.file.size > MAX_REQUEST_BYTES) {
    throw new Error(`"${original.name}" is still ${formatMb(prepared.file.size)} after resizing — save it as a JPEG and try again.`);
  }

  const form = new FormData();
  form.append("file", prepared.file);
  if (prepared.width && prepared.height) form.append(`dimensions:${prepared.file.name}`, `${prepared.width}x${prepared.height}`);
  if (folder) form.append("folder", folder);

  let res: Response;
  try {
    res = await fetch("/api/admin/media/upload", { method: "POST", body: form });
  } catch {
    throw new Error(`"${original.name}" didn't upload — check the internet connection and try again.`);
  }

  if (res.ok) {
    const body = (await res.json()) as { assets?: { url: string; filename: string }[] };
    const asset = body.assets?.[0];
    if (!asset) throw new Error(`"${original.name}" uploaded but the server returned no link.`);
    return { url: asset.url, filename: original.name };
  }

  if (res.status === 413) throw new Error(`"${original.name}" is too large for the server even after resizing.`);
  if (res.status === 401 || res.status === 403) throw new Error("Your admin session has expired — sign in again and retry.");
  const body = await res.json().catch(() => null);
  throw new Error(body?.error?.message ?? `"${original.name}" failed to upload (error ${res.status}).`);
}

interface PreparedImage {
  file: File;
  width?: number;
  height?: number;
}

/**
 * Downscales and re-encodes when it's worth it; otherwise hands the original back with its
 * measured size. Never throws — anything the browser can't decode goes up as-is, and the
 * server's own type check decides.
 *
 * `createImageBitmap` rather than an <img> on a `blob:` URL, because this app's CSP blocks
 * `blob:` images and that failure is silent.
 */
async function prepareImage(file: File): Promise<PreparedImage> {
  if (typeof createImageBitmap !== "function" || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { file };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { file };
  }

  const { width, height } = bitmap;
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_EDGE && file.size <= RESIZE_ABOVE_BYTES) {
    bitmap.close();
    return { file, width, height };
  }

  const scale = Math.min(1, MAX_EDGE / longEdge);
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    // Some browsers silently fall back to PNG when they can't encode WebP; that is usually
    // bigger than the original, so keep whichever is smaller.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return { file, width, height };
    return { file: new File([blob], renameExtension(file.name, "webp"), { type: "image/webp" }), width: targetWidth, height: targetHeight };
  } catch {
    return { file, width, height };
  } finally {
    bitmap.close();
  }
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

function renameExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
