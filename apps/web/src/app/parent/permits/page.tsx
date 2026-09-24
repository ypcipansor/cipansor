"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
// Children come from `useParentChildren`'s shared `ParentChild` shape.
// Each of these pages used to declare its own local `Child` with a nested
// `student` object the API never returns — see use-parent-portal.ts.
import type { ParentChild } from "@/hooks/use-parent-portal";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  LogOut,
  QrCode,
} from "lucide-react";

interface Permit {
  id: string;
  code?: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  departedAt?: string;
  returnedAt?: string;
  notes?: string;
  approvedBy?: {
    name: string;
  };
  approvedAt?: string;
  createdAt: string;
}

export default function PermitsPage() {
  const searchParams = useSearchParams();
  const selectedStudentId = searchParams.get("studentId");

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [permits, setPermits] = useState<Permit[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    type: "",
    reason: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        const res = await api.get("/parent/children");
        const childrenData = res.data.data || [];
        setChildren(childrenData);

        if (childrenData.length > 0) {
          const defaultChild = selectedStudentId
            ? childrenData.find((c: ParentChild) => c.id === selectedStudentId)
                ?.id
            : childrenData[0].id;
          setSelectedChild(defaultChild || childrenData[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch children:", err);
      }
    };

    fetchChildren();
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedChild) return;

    const fetchPermits = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/parent/children/${selectedChild}/permits`);
        setPermits(res.data.data || []);
      } catch (err) {
        console.error("Failed to fetch permits:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPermits();
  }, [selectedChild]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild) return;

    setSubmitting(true);
    try {
      await api.post(`/parent/children/${selectedChild}/permits`, formData);
      toast.success("Pengajuan izin berhasil dikirim");
      setDialogOpen(false);
      setFormData({ type: "", reason: "", startDate: "", endDate: "" });

      // Refresh permits list
      const res = await api.get(`/parent/children/${selectedChild}/permits`);
      setPermits(res.data.data || []);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || "Gagal mengajukan izin",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (permit: Permit) => {
    if (permit.returnedAt) {
      return (
        <Badge className="bg-blue-500">
          <CheckCircle className="h-3 w-3 mr-1" /> Selesai (Kembali)
        </Badge>
      );
    }
    if (permit.departedAt) {
      return (
        <Badge className="bg-orange-500 animate-pulse">
          <LogOut className="h-3 w-3 mr-1" /> Sedang Keluar
        </Badge>
      );
    }

    switch (permit.status) {
      case "APPROVED":
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" /> Disetujui
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" /> Ditolak
          </Badge>
        );
      case "PENDING":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" /> Menunggu
          </Badge>
        );
      case "COMPLETED":
        return (
          <Badge className="bg-blue-500">
            <CheckCircle className="h-3 w-3 mr-1" /> Selesai
          </Badge>
        );
      default:
        return <Badge variant="secondary">{permit.status}</Badge>;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      SICK: "Sakit",
      FAMILY: "Keperluan Keluarga",
      PERSONAL: "Keperluan Pribadi",
      OTHER: "Lainnya",
    };
    return labels[type] || type;
  };

  const selectedChildData = children.find((c) => c.id === selectedChild);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Izin</h1>
          <p className="text-muted-foreground">
            Ajukan dan lihat riwayat izin anak
          </p>
        </div>
        <div className="flex items-center gap-4">
          {children.length > 1 && (
            <Select value={selectedChild} onValueChange={setSelectedChild}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Pilih Anak" />
              </SelectTrigger>
              <SelectContent>
                {children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Ajukan Izin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajukan Izin</DialogTitle>
                <DialogDescription>
                  Ajukan izin untuk {selectedChildData?.name}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Jenis Izin</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jenis izin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SICK">Sakit</SelectItem>
                        <SelectItem value="FAMILY">
                          Keperluan Keluarga
                        </SelectItem>
                        <SelectItem value="PERSONAL">
                          Keperluan Pribadi
                        </SelectItem>
                        <SelectItem value="OTHER">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Tanggal Mulai</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={formData.startDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            startDate: e.target.value,
                          })
                        }
                        min={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">Tanggal Selesai</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={formData.endDate}
                        onChange={(e) =>
                          setFormData({ ...formData, endDate: e.target.value })
                        }
                        min={
                          formData.startDate ||
                          new Date().toISOString().split("T")[0]
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Alasan</Label>
                    <Textarea
                      id="reason"
                      placeholder="Jelaskan alasan izin..."
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                      }
                      rows={4}
                      required
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || !formData.type || !formData.reason}
                  >
                    {submitting ? "Mengirim..." : "Kirim Pengajuan"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : permits.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">Belum ada izin</h3>
            <p className="text-muted-foreground mt-2">
              Anda belum mengajukan izin untuk anak ini
            </p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajukan Izin Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {permits.map((permit) => (
            <Card key={permit.id}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {getTypeLabel(permit.type)}
                        </p>
                        {getStatusBadge(permit)}
                      </div>
                      {permit.code && (
                        <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs font-mono">
                          <QrCode className="h-3 w-3" />
                          {permit.code}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {permit.reason}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(permit.startDate).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                          {" - "}
                          {new Date(permit.endDate).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">
                      Diajukan:{" "}
                      {new Date(permit.createdAt).toLocaleDateString("id-ID")}
                    </p>
                    {permit.approvedBy && (
                      <p className="text-muted-foreground mt-1">
                        {permit.status === "APPROVED" ? "Disetujui" : "Ditolak"}{" "}
                        oleh:{" "}
                        <span className="font-medium">
                          {permit.approvedBy.name}
                        </span>
                      </p>
                    )}
                    {permit.notes && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted-foreground">Catatan:</span>{" "}
                        {permit.notes}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
