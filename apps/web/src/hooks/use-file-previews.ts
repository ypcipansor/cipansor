import { useCallback, useEffect, useRef, useState } from "react";
import { objectUrlForFile, releaseObjectUrl } from "@/lib/files";

/**
 * Owns the `blob:` preview URLs for a set of picked files and revokes each one
 * when its file is removed or the component unmounts.
 *
 * A bare `URL.createObjectURL` result keeps the file's bytes alive for the
 * lifetime of the document, so the assessment wizards leaked a reference per
 * uploaded-then-removed (or abandoned) preview until the page navigated away.
 * Pairing the file and its URL here means the revoke cannot be forgotten: the
 * only ways a preview leaves the list both go through `removeAt` or the unmount
 * effect.
 */
export interface FilePreview {
  file: File;
  url: string;
}

export function useFilePreviews() {
  const [items, setItems] = useState<FilePreview[]>([]);
  // The unmount cleanup must see the latest list without re-registering the
  // effect on every change, and refs may not be read during render (React
  // compiler), so the mirror is refreshed in its own effect.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) releaseObjectUrl(item.url);
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    // Build the URLs once, outside the state updater. React Strict Mode
    // double-invokes updaters; creating an object URL inside one registered two
    // blobs per file and only ever kept (and revoked) one of them. `addFiles`
    // runs from an event handler, so this is not part of a render.
    const next = files.map((file) => ({ file, url: objectUrlForFile(file) }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const removeAt = useCallback((index: number) => {
    const target = itemsRef.current[index];
    if (target) releaseObjectUrl(target.url);
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    items,
    files: items.map((item) => item.file),
    previews: items.map((item) => item.url),
    addFiles,
    removeAt,
  };
}
