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

/**
 * Selfie + geotag capture for clock-in/out.
 *
 * The camera is best-effort: a browser without one (or a denied permission)
 * must not block attendance, so the operator can fall back to a file upload
 * and to coordinates typed by hand. The policy decides whether the evidence is
 * required at all — this component only supplies it.
 */
export function SelfieCapture({
  photoBlob,
  onPhoto,
  geo,
  onGeo,
}: {
  photoBlob: Blob | null;
  onPhoto: (blob: Blob | null) => void;
  geo: GeoPoint | null;
  onGeo: (point: GeoPoint | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
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
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError(
        "Kamera tidak dapat diakses. Gunakan tombol unggah foto sebagai gantinya.",
      );
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
        if (blob) onPhoto(blob);
        stopStream();
      },
      "image/jpeg",
      0.85,
    );
  };

  const locate = () => {
    setLocating(true);
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Perangkat ini tidak mendukung lokasi.");
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
          "Lokasi tidak dapat dibaca. Izinkan akses lokasi atau isi koordinat manual.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={startCamera}
          disabled={starting}
        >
          {starting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          Nyalakan Kamera
        </Button>
        <Button type="button" onClick={takePhoto} disabled={!cameraOn}>
          <Camera className="mr-2 h-4 w-4" />
          Ambil Foto
        </Button>
        <Button type="button" variant="outline" asChild>
          <label className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" />
            Unggah Foto
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </Button>
        {photoBlob && (
          <Button type="button" variant="ghost" onClick={() => onPhoto(null)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Ambil Ulang
          </Button>
        )}
      </div>

      {cameraError && (
        <p className="text-sm text-amber-600" role="status">
          {cameraError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-md border bg-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Pratinjau selfie absen"
              className="h-56 w-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-56 w-full bg-black object-cover"
            />
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
            Baca Lokasi Saya
          </Button>
          {geo ? (
            <p className="text-sm text-muted-foreground">
              {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}
              {geo.accuracyMeters
                ? ` (±${Math.round(geo.accuracyMeters)} m)`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Lokasi belum dibaca.
            </p>
          )}
          {geoError && (
            <p className="text-sm text-amber-600" role="status">
              {geoError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
