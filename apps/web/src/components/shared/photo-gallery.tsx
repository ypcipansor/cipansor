"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  Upload,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PhotoGalleryItem {
  id: string;
  /**
   * The browser-usable URL, or null while a protected photo's SAS/file token is
   * still being minted. Never a raw private reference — the gallery renders a
   * muted placeholder instead, so an uncredentialised URL is never requested.
   */
  url: string | null;
  thumbnail?: string;
  caption?: string;
  category?: string;
  uploadedAt: Date;
}

/** The URL actually usable as an image source, or null while unresolved. */
function gallerySrc(photo: PhotoGalleryItem): string | null {
  return photo.thumbnail || photo.url || null;
}

interface PhotoGalleryProps {
  photos: PhotoGalleryItem[];
  onUpload?: (files: File[]) => Promise<void>;
  onDelete?: (photoId: string) => Promise<void>;
  onShare?: (photo: PhotoGalleryItem) => void;
  maxPhotos?: number;
  categories?: string[];
  editable?: boolean;
  className?: string;
}

export function PhotoGallery({
  photos,
  onUpload,
  onDelete,
  onShare,
  maxPhotos = 10,
  categories = ["Kegiatan", "Hasil Karya", "Makan", "Tidur", "Bermain"],
  editable = true,
  className,
}: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoGalleryItem | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPhotos =
    filterCategory === "all"
      ? photos
      : photos.filter((p) => p.category === filterCategory);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      if (photos.length + files.length > maxPhotos) {
        toast.error(`Maksimal ${maxPhotos} foto`);
        return;
      }

      const validFiles = Array.from(files).filter((file) => {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} bukan file gambar`);
          return false;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} terlalu besar (max 5MB)`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      setIsUploading(true);
      try {
        await onUpload?.(validFiles);
        toast.success(`${validFiles.length} foto berhasil diupload`);
      } catch {
        toast.error("Gagal mengupload foto");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [photos.length, maxPhotos, onUpload],
  );

  const handleDelete = useCallback(
    async (photoId: string) => {
      try {
        await onDelete?.(photoId);
        toast.success("Foto berhasil dihapus");
        setSelectedPhoto(null);
      } catch {
        toast.error("Gagal menghapus foto");
      }
    },
    [onDelete],
  );

  const navigatePhoto = useCallback(
    (direction: "prev" | "next") => {
      if (!selectedPhoto) return;

      const currentIndex = filteredPhotos.findIndex(
        (p) => p.id === selectedPhoto.id,
      );
      const newIndex =
        direction === "prev"
          ? (currentIndex - 1 + filteredPhotos.length) % filteredPhotos.length
          : (currentIndex + 1) % filteredPhotos.length;

      setSelectedPhoto(filteredPhotos[newIndex]);
    },
    [selectedPhoto, filteredPhotos],
  );

  return (
    <div className={className}>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge
          variant={filterCategory === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setFilterCategory("all")}
        >
          Semua ({photos.length})
        </Badge>
        {categories.map((cat) => {
          const count = photos.filter((p) => p.category === cat).length;
          return (
            <Badge
              key={cat}
              variant={filterCategory === cat ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilterCategory(cat)}
            >
              {cat} ({count})
            </Badge>
          );
        })}
      </div>

      {/* Photo Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Upload Button */}
        {editable && photos.length < maxPhotos && (
          <Card
            className="aspect-square cursor-pointer border-dashed hover:border-primary hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="h-full flex flex-col items-center justify-center p-4">
              {isUploading ? (
                <div className="animate-pulse">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-xs text-muted-foreground text-center">
                    Tambah Foto
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Photo Thumbnails */}
        {filteredPhotos.map((photo) => (
          <Card
            key={photo.id}
            className="aspect-square cursor-pointer overflow-hidden group relative"
            onClick={() => setSelectedPhoto(photo)}
          >
            {gallerySrc(photo) ? (
              <Image
                src={gallerySrc(photo) as string}
                alt={photo.caption || "Photo"}
                fill
                className="object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="h-6 w-6 text-white" />
            </div>
            {/* Category Badge */}
            {photo.category && (
              <Badge className="absolute bottom-2 left-2 text-xs">
                {photo.category}
              </Badge>
            )}
          </Card>
        ))}

        {/* Empty State */}
        {photos.length === 0 && (
          <Card className="col-span-full py-12">
            <CardContent className="flex flex-col items-center text-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Belum ada foto</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Lightbox Dialog */}
      <Dialog
        open={!!selectedPhoto}
        onOpenChange={() => setSelectedPhoto(null)}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent">
            <DialogTitle className="text-white">
              {selectedPhoto?.caption || "Foto"}
            </DialogTitle>
          </DialogHeader>

          {selectedPhoto && (
            <div className="relative aspect-video bg-black">
              {gallerySrc(selectedPhoto) && (
                <Image
                  src={gallerySrc(selectedPhoto) as string}
                  alt={selectedPhoto.caption || "Photo"}
                  fill
                  className="object-contain"
                />
              )}

              {/* Navigation Arrows */}
              {filteredPhotos.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigatePhoto("prev");
                    }}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigatePhoto("next");
                    }}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {/* Action Buttons */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {onShare && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onShare(selectedPhoto)}
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Share WA
                  </Button>
                )}
                {gallerySrc(selectedPhoto) && (
                  <Button variant="secondary" size="sm" asChild>
                    <a href={gallerySrc(selectedPhoto) as string} download>
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </a>
                  </Button>
                )}
                {editable && onDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(selectedPhoto.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Hapus
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Compact gallery for daily report cards
export function DailyReportPhotoPreview({
  photos,
  maxPreview = 4,
  onViewAll,
}: {
  photos: PhotoGalleryItem[];
  maxPreview?: number;
  onViewAll?: () => void;
}) {
  const previewPhotos = photos.slice(0, maxPreview);
  const remaining = photos.length - maxPreview;

  if (photos.length === 0) return null;

  return (
    <div className="flex gap-2">
      {previewPhotos.map((photo, index) => (
        <div
          key={photo.id}
          className={cn(
            "relative w-16 h-16 rounded-lg overflow-hidden",
            index === maxPreview - 1 && remaining > 0 && "cursor-pointer",
          )}
          onClick={
            index === maxPreview - 1 && remaining > 0 ? onViewAll : undefined
          }
        >
          {gallerySrc(photo) ? (
            <Image
              src={gallerySrc(photo) as string}
              alt=""
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          {index === maxPreview - 1 && remaining > 0 && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-bold">+{remaining}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
