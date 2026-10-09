"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { objectUrlForFile, releaseObjectUrl } from "@/lib/files";
import { Camera, Loader2, MapPin, RefreshCw, Upload } from "lucide-react";

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export type PhotoSource = "CAMERA" | "FILE";

/**
 * Selfie + geotag capture for clock-in/out.
 *
 * The photo is taken live from the camera. Picking a file is offered only when
 * the camera cannot be opened, and such a photo is marked FILE so the unit
 * admin can review it (decided 2026-10-09): a gallery picker accepts any old
 * picture, which proves nothing about today. Location is read by the device;
 * there is no way to type coordinates — a typed position would defeat the
 * geofence it is checked against.
 */
export function SelfieCapture({
  photoBlob,
  photoSource,
  onPhoto,
  geo,
  onGeo,
  readLocationOnOpen,
}: {
  photoBlob: Blob | null;
  photoSource: PhotoSource | null;
  onPhoto: (blob: Blob | null, source: PhotoSource | null) => void;
  geo: GeoPoint | null;
  onGeo: (point: GeoPoint | null) => void;
  /** Read the position once when the page opens (the unit requires it). */
  readLocationOnOpen: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [starting, setStarting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  // Release the camera when the page goes away; a live track keeps the
  // recording indicator on and the device busy for other apps.
  useEffect(() => stopStream, [stopStream]);

  // The preview URL is derived from the blob, not stored: deriving it in an
  // effect meant a second render (and a stale URL) for every picked photo.
  const previewUrl = useMemo(
    () => (photoBlob ? objectUrlForFile(photoBlob) : null),
    [photoBlob],
  );
  // A blob URL pins its bytes until revoked, so each replacement is released.
  useEffect(() => () => releaseObjectUrl(previewUrl), [previewUrl]);

  const startCamera = async () => {
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("no camera API");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraOn(true);
      onPhoto(null, null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraUnavailable(true);
    } finally {
      setStarting(false);
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) onPhoto(blob, "CAMERA");
        stopStream();
      },
      "image/jpeg",
      0.85,
    );
  };

  const locate = useCallback(() => {
    setLocating(true);
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Perangkat ini tidak dapat membaca lokasi.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onGeo({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
        setLocating(false);
      },
      () => {
        setGeoError(
          "Lokasi tidak dapat dibaca. Izinkan akses lokasi untuk situs ini di pengaturan peramban, lalu baca ulang.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [onGeo]);

  // Ask once on open when the unit needs a position, so the employee does not
  // have to find the button first; the button stays for a retry.
  const asked = useRef(false);
  useEffect(() => {
    if (readLocationOnOpen && !asked.current) {
      asked.current = true;
      locate();
    }
  }, [readLocationOnOpen, locate]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-md border bg-muted">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Pratinjau swafoto absen"
                className="h-56 w-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  aria-label="Kamera"
                  className={
                    cameraOn ? "h-56 w-full bg-black object-cover" : "hidden"
                  }
                />
                {!cameraOn && (
                  <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Camera className="h-8 w-8" aria-hidden />
                    Kamera belum dibuka
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {cameraOn ? (
              <Button type="button" onClick={takePhoto}>
                <Camera className="mr-2 h-4 w-4" />
                Ambil Foto
              </Button>
            ) : (
              <Button
                type="button"
                variant={photoBlob ? "outline" : "default"}
                onClick={startCamera}
                disabled={starting}
              >
                {starting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : photoBlob ? (
                  <RefreshCw className="mr-2 h-4 w-4" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                {photoBlob ? "Foto Ulang" : "Buka Kamera"}
              </Button>
            )}
            {cameraUnavailable && (
              <Button type="button" variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Pilih Foto dari Perangkat
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="user"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      onPhoto(file, file ? "FILE" : null);
                    }}
                  />
                </label>
              </Button>
            )}
          </div>
          {cameraUnavailable && (
            <p
              className="text-sm text-amber-700 dark:text-amber-400"
              role="status"
            >
              Kamera tidak dapat dibuka. Anda boleh memilih foto dari perangkat;
              absen dengan foto dari berkas ditandai untuk ditinjau admin unit.
            </p>
          )}
          {photoSource === "FILE" && photoBlob && (
            <p className="text-xs text-muted-foreground">
              Foto ini dari berkas, bukan dari kamera.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={locate}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="mr-2 h-4 w-4" />
            )}
            {geo ? "Baca Ulang Lokasi" : "Baca Lokasi Saya"}
          </Button>
          {geo ? (
            <p className="text-sm text-muted-foreground">
              Lokasi terbaca
              {geo.accuracyMeters
                ? `, ketelitian ±${Math.round(geo.accuracyMeters)} m`
                : ""}
              .
            </p>
          ) : (
            !geoError && (
              <p className="text-sm text-muted-foreground">
                {locating ? "Membaca lokasi…" : "Lokasi belum dibaca."}
              </p>
            )
          )}
          {geoError && (
            <p
              className="text-sm text-amber-700 dark:text-amber-400"
              role="status"
            >
              {geoError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
