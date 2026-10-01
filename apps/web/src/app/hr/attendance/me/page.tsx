"use client";

import { useState } from "react";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelfieCapture, type GeoPoint } from "@/components/hr/SelfieCapture";
import {
  useMyAttendanceToday,
  useSelfCheckIn,
  useSelfCheckOut,
  STAFF_ATTENDANCE_STATUS_LABELS,
} from "@/hooks";
import { safeFormat } from "@/lib/date";
import api from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Absen Mandiri — the employee clocks themselves in and out.
 *
 * The policy is enforced by the API (selfie/location may be required, and a
 * position outside every geofence may be rejected); this page just collects
 * the evidence and shows what the server did with it.
 */
export default function SelfAttendancePage() {
  const { data, isLoading } = useMyAttendanceToday();
  const checkIn = useSelfCheckIn();
  const checkOut = useSelfCheckOut();
  const attendance = data?.attendance ?? null;

  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uploadPhoto = async (): Promise<string | undefined> => {
    if (!photoBlob) return undefined;
    const form = new FormData();
    form.append(
      "file",
      new File([photoBlob], `absen-${Date.now()}.jpg`, {
        type: photoBlob.type || "image/jpeg",
      }),
    );
    const res = await api.post("/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const url: string | undefined = res.data?.data?.url;
    if (!url) throw new Error("Unggah foto gagal");
    return url;
  };

  const submit = async (kind: "in" | "out") => {
    setSubmitting(true);
    try {
      const photoUrl = await uploadPhoto();
      const payload = {
        photoUrl,
        latitude: geo?.latitude,
        longitude: geo?.longitude,
        accuracyMeters: geo?.accuracyMeters,
        deviceInfo:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      };
      if (kind === "in") {
        const result = await checkIn.mutateAsync(payload);
        toast.success(
          result.lateMinutes > 0
            ? `Absen masuk tercatat, terlambat ${result.lateMinutes} menit`
            : "Absen masuk tercatat",
        );
      } else {
        await checkOut.mutateAsync(payload);
        toast.success("Absen pulang tercatat");
      }
      setPhotoBlob(null);
      setGeo(null);
    } catch {
      toast.error("Absen gagal disimpan");
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = attendance
    ? STAFF_ATTENDANCE_STATUS_LABELS[attendance.status]
    : null;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Absen Mandiri</h1>
          <p className="text-muted-foreground">
            Catat kehadiran Anda hari ini dengan selfie dan lokasi
          </p>
        </div>

        {data?.isExempt ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Anda dikecualikan dari absensi harian menurut kebijakan kepegawaian,
            jadi tombol absen dimatikan.
          </div>
        ) : data && !data.isWorkDay ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Hari ini bukan hari kerja untuk unit Anda.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Status Hari Ini</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : attendance ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge>{statusLabel}</Badge>
                    {attendance.lateMinutes ? (
                      <span className="text-sm text-amber-600">
                        Terlambat {attendance.lateMinutes} menit
                      </span>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Jam masuk</dt>
                    <dd>
                      {attendance.checkIn
                        ? safeFormat(new Date(attendance.checkIn), "HH:mm")
                        : "—"}
                    </dd>
                    <dt className="text-muted-foreground">Jam pulang</dt>
                    <dd>
                      {attendance.checkOut
                        ? safeFormat(new Date(attendance.checkOut), "HH:mm")
                        : "—"}
                    </dd>
                    {attendance.shift && (
                      <>
                        <dt className="text-muted-foreground">Shift</dt>
                        <dd>
                          {attendance.shift.name} ({attendance.shift.startTime}–
                          {attendance.shift.endTime})
                        </dd>
                      </>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {attendance.records.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                      >
                        {record.kind === "CHECK_IN" ? (
                          <LogIn className="h-3 w-3" />
                        ) : (
                          <LogOut className="h-3 w-3" />
                        )}
                        {record.isWithinRadius === false ? (
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                        ) : record.isWithinRadius === true ? (
                          <MapPin className="h-3 w-3 text-green-600" />
                        ) : null}
                        <span>
                          {record.distanceMeters !== undefined &&
                          record.distanceMeters !== null
                            ? `${record.distanceMeters} m`
                            : "lokasi tidak dicatat"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Belum ada absen hari ini.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ambil Bukti Kehadiran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SelfieCapture
                photoBlob={photoBlob}
                onPhoto={setPhotoBlob}
                geo={geo}
                onGeo={setGeo}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => submit("in")}
                  disabled={submitting || !data?.canCheckIn}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Absen Masuk
                </Button>
                <Button
                  variant="outline"
                  onClick={() => submit("out")}
                  disabled={submitting || !data?.canCheckOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Absen Pulang
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
