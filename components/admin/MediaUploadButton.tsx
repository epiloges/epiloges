"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaFiles } from "@/components/admin/upload-images";

/**
 * Uploads to /api/admin/media/upload through the shared uploader (components/admin/upload-images.ts),
 * which resizes each photo in the browser and sends them one at a time, so an uploaded image
 * appears in the library straight away and a batch of phone photos no longer trips Vercel's
 * request-size limit.
 */
export function MediaUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    // Reset first, so choosing the same file again after a failure still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    setErrors([]);
    setProgress({ done: 0, total: files.length });
    const result = await uploadMediaFiles(files, { onProgress: (done, total) => setProgress({ done, total }) });
    setProgress(null);
    setErrors(result.errors);
    if (result.media.length > 0) router.refresh();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="h-9 bg-luxe-black px-4 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50"
      >
        {progress ? `Uploading ${progress.done}/${progress.total}…` : "Upload"}
      </button>
      {errors.length > 0 ? (
        <ul className="absolute top-full right-0 z-10 mt-1 w-72 space-y-1 bg-luxe-white text-right text-xs text-destructive">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
