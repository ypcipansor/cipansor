"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera,
  Upload,
  X,
  Image as ImageIcon,
  GripVertical,
  ZoomIn,
  RotateCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export interface PhotoItem {
  id: string;
  file?: File;
  url: string;
  caption?: string;
  order: number;
}

interface PhotoUploaderProps {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  maxPhotos?: number;
  maxSizeMB?: number;
  readOnly?: boolean;
  className?: string;
  showCaption?: boolean;
  acceptedTypes?: string[];
}

export function PhotoUploader({
  photos,
  onChange,
  maxPhotos = 5,
  maxSizeMB = 5,
  readOnly = false,
  className,
  showCaption = true,
  acceptedTypes = ["image/jpeg", "image/png", "image/webp"],
}: PhotoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return "Format file tidak didukung. Gunakan JPG, PNG, atau WebP.";
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `Ukuran file maksimal ${maxSizeMB}MB`;
    }
    return null;
  };

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      const remainingSlots = maxPhotos - photos.length;

      if (remainingSlots <= 0) {
        setError(`Maksimal ${maxPhotos} foto`);
        return;
      }

      const newPhotos: PhotoItem[] = [];
      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      for (const file of filesToProcess) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          continue;
        }

        const url = URL.createObjectURL(file);
        newPhotos.push({
          id: crypto.randomUUID(),
          file,
          url,
          caption: "",
          order: photos.length + newPhotos.length,
        });
      }

      if (newPhotos.length > 0) {
        onChange([...photos, ...newPhotos]);
      }
    },
    [photos, maxPhotos, onChange, acceptedTypes, maxSizeMB, validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removePhoto = (id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (photo?.url.startsWith("blob:")) {
      URL.revokeObjectURL(photo.url);
    }
    onChange(
      photos.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i })),
    );
  };

  const updateCaption = (id: string, caption: string) => {
    onChange(photos.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  const movePhoto = (id: string, direction: "up" | "down") => {
    const index = photos.findIndex((p) => p.id === id);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= photos.length) return;

    const newPhotos = [...photos];
    [newPhotos[index], newPhotos[newIndex]] = [
      newPhotos[newIndex],
      newPhotos[index],
    ];
    onChange(newPhotos.map((p, i) => ({ ...p, order: i })));
  };

  // Revoke every outstanding preview URL on unmount. `removePhoto` only frees
  // the ones the user deletes; the ones still present when the page is
  // navigated away from would otherwise pin their files' bytes for the
  // document's lifetime.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) {
        if (photo.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
      }
    };
  }, []);

  if (readOnly) {
    if (photos.length === 0) {
      return (
        <div
          className={cn("text-center py-6 text-muted-foreground", className)}
        >
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Tidak ada foto</p>
        </div>
      );
    }

    return (
      <div className={cn("space-y-3", className)}>
        <Label className="text-sm font-medium flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Foto Kegiatan ({photos.length})
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo) => (
            <Dialog key={photo.id}>
              <DialogTrigger asChild>
                <div className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group">
                  <img
                    src={photo.url}
                    alt={photo.caption || "Foto kegiatan"}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="h-6 w-6 text-white" />
                  </div>
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-xs text-white truncate">
                        {photo.caption}
                      </p>
                    </div>
                  )}
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-0">
                <img
                  src={photo.url}
                  alt={photo.caption || "Foto kegiatan"}
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
                {photo.caption && (
                  <div className="p-4 bg-muted/50">
                    <p className="text-sm">{photo.caption}</p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Foto Kegiatan
          <span className="text-muted-foreground font-normal">
            ({photos.length}/{maxPhotos})
          </span>
        </Label>
      </div>

      {/* Error message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Upload area */}
      {photos.length < maxPhotos && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-1">
            Drag & drop foto atau klik untuk upload
          </p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP • Maks {maxSizeMB}MB per file
          </p>
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <Card key={photo.id} className="overflow-hidden">
              <div className="relative aspect-square">
                <img
                  src={photo.url}
                  alt={photo.caption || `Foto ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 bg-white/90 hover:bg-white"
                    onClick={() => removePhoto(photo.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="absolute top-2 left-2">
                  <span className="bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                    {index + 1}
                  </span>
                </div>
              </div>
              {showCaption && (
                <CardContent className="p-2">
                  <Input
                    value={photo.caption || ""}
                    onChange={(e) => updateCaption(photo.id, e.target.value)}
                    placeholder="Keterangan foto..."
                    className="h-8 text-sm"
                  />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Quick capture button (mobile) */}
      {photos.length < maxPhotos && (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:hidden"
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.setAttribute("capture", "environment");
              fileInputRef.current.click();
              fileInputRef.current.removeAttribute("capture");
            }
          }}
        >
          <Camera className="h-4 w-4 mr-2" />
          Ambil Foto
        </Button>
      )}
    </div>
  );
}

export default PhotoUploader;
