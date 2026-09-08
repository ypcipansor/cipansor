"use client";

/**
 * Tunggakan (arrears) panel — formerly the standalone /finance/billing page.
 *
 * It duplicated /finance: both listed santri billing, and they disagreed.
 * /finance aggregates across units, while this screen required a unit to be
 * picked and defaulted to none, so the same data read as "Rp 4.750.000
 * outstanding" on one page and "Rp 0 — 0 Santri memiliki tagihan aktif" on the
 * other. It is now a tab of /finance instead of a rival page.
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Bell,
  RefreshCw,
  Filter,
  Banknote,
  Send,
  Download,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUnits } from "@/hooks/use-units";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function TunggakanPanel() {
  const [search, setSearch] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  
  const { data: unitsData } = useUnits();

  // 1. Fetch Students with Outstanding Balances
  // Endpoint: GET /api/finance/unit/:id/outstanding
  const { data: outstandingData, isLoading, refetch } = useQuery({
    queryKey: ["finance-outstanding", selectedUnitId, search, statusFilter],
    queryFn: async () => {
      // Need a unit selected to get outstanding or fetch all by not passing unit
      const endpoint = selectedUnitId 
        ? `/finance/unit/${selectedUnitId}/outstanding` 
        : `/finance/outstanding`; 
        
      const res = await api.get(endpoint, {
        params: {
          search: search || undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined
        }
      });
      return res.data;
    },
    // Only fetch if we have a unit ID selected, or if we adjust API to support global
    enabled: !!selectedUnitId, 
  });

  // 2. Mock Action for Sending Reminders
  const sendReminderMutation = useMutation({
    mutationFn: async (studentId: string) => {
      // In a real scenario, this would trigger a WhatsApp or Push Notification
      return new Promise(resolve => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      toast.success("Notifikasi tagihan berhasil dikirim");
    },
    onError: () => {
      toast.error("Gagal mengirim notifikasi ragi");
    }
  });

  const students = outstandingData?.data || [];

  const handleSendReminder = (studentId: string) => {
    sendReminderMutation.mutate(studentId);
  };

  const handleSendBulkReminder = () => {
    toast.success(`Mengirim notifikasi ke ${students.length} santri...`);
    // Implementation for bulk send
  };

  const totalArrears = useMemo(() => {
    return students.reduce((sum: number, student: any) => sum + (student.unpaidAmount || 0), 0);
  }, [students]);

  return (
    <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Filter Data Tunggakan</CardTitle>
                  <CardDescription>Pilih unit untuk melihat daftar tunggakan santri</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-2">
                <Select
                  value={selectedUnitId}
                  onValueChange={setSelectedUnitId}
                >
                  <SelectTrigger className="w-full sm:w-[250px]">
                    <SelectValue placeholder="Pilih Unit Sekolah" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsData?.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama santri atau NISN..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                    disabled={!selectedUnitId}
                  />
                </div>
                
                <Button 
                   variant="outline" 
                   onClick={() => refetch()}
                   disabled={!selectedUnitId || isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-80">Total Outstanding (Unit)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {selectedUnitId ? formatCurrency(totalArrears) : "Rp 0"}
              </div>
              <p className="text-xs opacity-80 flex items-center">
                <AlertCircle className="h-3 w-3 mr-1" />
                {students.length} Santri memiliki tagihan aktif
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Daftar Tunggakan Santri</CardTitle>
                <CardDescription>Menampilkan tagihan yang belum dibayar</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={students.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSendBulkReminder}
                  disabled={students.length === 0}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Kirim Pengingat Masal
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Santri</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>No. HP Orang Tua</TableHead>
                  <TableHead className="text-right">Total Tunggakan</TableHead>
                  <TableHead className="w-[150px]">Status</TableHead>
                  <TableHead className="text-right w-[150px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedUnitId ? (
                   <TableRow>
                     <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        Pilih unit sekolah terlebih dahulu untuk melihat data tunggakan.
                     </TableCell>
                   </TableRow>
                ) : isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                      <p className="text-muted-foreground">Memuat data tagihan...</p>
                    </TableCell>
                  </TableRow>
                ) : students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                      <p className="font-medium text-foreground">Semua tagihan lunas!</p>
                      Tidak ada santri dengan tagihan menunggak.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student: any) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="font-medium">{student.user?.name}</div>
                        <div className="text-xs text-muted-foreground">NISN: {student.nisn}</div>
                      </TableCell>
                      <TableCell>
                        {student.enrollments?.[0]?.class?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {student.user?.phone || student.user?.email || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-red-600">
                        {formatCurrency(student.unpaidAmount)}
                      </TableCell>
                      <TableCell>
                         <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100">
                           Tunggakan
                         </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                           variant="outline" 
                           size="sm" 
                           onClick={() => handleSendReminder(student.id)}
                           disabled={sendReminderMutation.isPending}
                        >
                          <Send className="h-3 w-3 mr-2" />
                          Ingatkan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
    </div>
  );
}
