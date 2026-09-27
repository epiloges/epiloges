"use client";

import { useRef, useState } from "react";
import { MediaLibraryPicker } from "@/components/admin/MediaLibraryPicker";
import { uploadMediaFiles } from "@/components/admin/upload-images";

/**
 * Upload / pick-from-library buttons and a preview, for any form field that holds one image URL.
 *
 * Category, collection, blog, homepage and SEO images were plain "Image URL" text boxes, so the
 * only way to add one was to upload it in the Media Library, copy its link, come back and paste
 * it. This sits under the existing input and writes into it through `onChange`, so each form's
 * own validation and saving are unchanged — pasting a link still works exactly as before.
 */
export function ImageFieldTools({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(null);
    setStatus("Uploading…");
    const result = await uploadMediaFiles([file]);
    setStatus(null);
    if (result.media[0]) onChange(result.media[0].url);
    else setError(result.errors[0] ?? "Upload failed.");
  }

  const src = value?.trim();

  return (
    <div className="mt-2 flex items-center gap-3">
      {src ? (
        // A plain <img>: the preview can be any host an admin pastes, and next/image refuses
        // hosts that aren't configured — this is a thumbnail, not a storefront image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-12 border border-border object-cover" />
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status !== null}
        className="h-8 border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase disabled:opacity-50"
      >
        {status ?? "Upload"}
      </button>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="h-8 px-1 text-xs underline underline-offset-4 hover:opacity-70"
      >
        Choose from library
      </button>
      {src ? (
        <button type="button" onClick={() => onChange("")} className="h-8 px-1 text-xs text-luxe-gray-dark hover:text-destructive">
          Remove
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <MediaLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(assets) => {
          if (assets[0]) onChange(assets[0].url);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
