"use client";
import { siteConfig, addressLines } from "@/config/site";
import { useRaporDetail, RaporPesantren } from "@/hooks/use-rapor-pesantren";
import { safeFormat } from "@/lib/date";
import { useParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

import { id as localeId } from "date-fns/locale";

function RaporPrintPageContent() {
  const params = useParams();
  const id = params?.id as string;
  const { data: rapor, isLoading } = useRaporDetail(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!rapor) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Data rapor tidak ditemukan</p>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-gray-100 min-h-screen p-8 print:p-0 print:bg-white text-black">
      {/* Print Button (Hidden when printing) */}
      <div className="max-w-[210mm] mx-auto mb-6 flex justify-end print:hidden">
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Cetak Rapor
        </Button>
      </div>

      {/* A4 Page Container */}
      <div className="max-w-[210mm] mx-auto bg-white p-[20mm] shadow-md print:shadow-none print:max-w-none print:mx-0">
        {/* Header (Kop Surat) */}
        <div className="border-b-4 border-double border-black pb-4 mb-6 text-center">
          <div className="flex items-center justify-center gap-4 mb-2">
            {rapor.unit?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rapor.unit.logoUrl}
                alt="Logo"
                className="h-20 w-20 object-contain"
              />
            )}
            <div>
              <h1 className="text-xl font-bold uppercase">
                YAYASAN PESANTREN CIPANSOR
              </h1>
              <h2 className="text-2xl font-bold uppercase">
                {rapor.unit?.name || "SMA QUR'AN CIPANSOR"}
              </h2>
            </div>
          </div>
          <p className="text-sm mt-1">
            {rapor.unit?.address || addressLines.join(", ")}
          </p>
          <p className="text-sm">
            Telp: {rapor.unit?.phone || siteConfig.contact.phone} | Email:{" "}
            {rapor.unit?.email || siteConfig.contact.email} | Website:{" "}
            {rapor.unit?.website || siteConfig.url.replace(/^https?:\/\//, "")}
          </p>
        </div>

        <h3 className="text-xl font-bold text-center mb-6 uppercase underline">
          LAPORAN HASIL BELAJAR SANTRI
        </h3>

        {/* Student Info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-8 text-sm">
          <div className="grid grid-cols-[120px_10px_1fr]">
            <span>Nama Santri</span>
            <span>:</span>
            <span className="font-semibold uppercase">
              {rapor.student.name}
            </span>
          </div>
          <div className="grid grid-cols-[120px_10px_1fr]">
            <span>Tahun Ajaran</span>
            <span>:</span>
            <span>{rapor.academicYear.name}</span>
          </div>
          <div className="grid grid-cols-[120px_10px_1fr]">
            <span>Nomor Induk / NISN</span>
            <span>:</span>
            <span>
              {rapor.student.nisn} / {rapor.student.nisn || "-"}
            </span>
          </div>
          <div className="grid grid-cols-[120px_10px_1fr]">
            <span>Semester</span>
            <span>:</span>
            <span>
              {rapor.semester} ({rapor.semester % 2 === 1 ? "Ganjil" : "Genap"})
            </span>
          </div>
          <div className="grid grid-cols-[120px_10px_1fr]">
            <span>Kelas / Asrama</span>
            <span>:</span>
            <span>
              {rapor.student.class.name} / {rapor.student.dormRoom?.name || "-"}
            </span>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          {/* 1. TAHFIDZ AL-QURAN */}
          <Section title="A. TAHFIDZ AL-QURAN">
            <div className="grid grid-cols-2 gap-4 mb-2 text-sm">
              <div>
                Total Hafalan: <strong>{rapor.tahfidz.totalJuz} Juz</strong>
              </div>
              <div>
                Capaian Semester Ini:{" "}
                <strong>{rapor.tahfidz.totalAyah} Ayat</strong>
              </div>
            </div>
            <Table>
              <thead className="bg-gray-100">
                <tr>
                  <th className="w-10">No</th>
                  <th>Komponen</th>
                  <th className="w-24">Nilai</th>
                  <th className="w-32">Predikat</th>
                  <th className="w-24">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-center">1</td>
                  <td>Kelancaran Hafalan (Itqin)</td>
                  <td className="text-center">
                    {rapor.tahfidz.score?.toFixed(0) || 0}
                  </td>
                  <td className="text-center font-medium">
                    {rapor.tahfidz.grade}
                  </td>
                  <td className="text-center">-</td>
                </tr>
                <tr>
                  <td className="text-center">2</td>
                  <td>Tajwid & Fashohah</td>
                  <td className="text-center">
                    {rapor.tahfidz.score?.toFixed(0) || 0}
                  </td>
                  <td className="text-center font-medium">
                    {rapor.tahfidz.grade}
                  </td>
                  <td className="text-center">-</td>
                </tr>
              </tbody>
            </Table>
          </Section>

          {/* 2. IBADAH HARIAN */}
          <Section title="B. IBADAH HARIAN">
            <Table>
              <thead className="bg-gray-100">
                <tr>
                  <th className="w-10">No</th>
                  <th>Aspek Ibadah</th>
                  <th className="w-24">Persentase</th>
                  <th className="w-32">Predikat</th>
                </tr>
              </thead>
              <tbody>
                {rapor.ibadah.categoryBreakdown.map((cat, idx) => (
                  <tr key={idx}>
                    <td className="text-center">{idx + 1}</td>
                    <td>{cat.category}</td>
                    <td className="text-center">
                      {cat.completionRate.toFixed(0)}%
                    </td>
                    <td className="text-center">
                      {getPredicate(cat.completionRate)}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-50">
                  <td colSpan={2} className="text-right pr-4">
                    Rata-rata
                  </td>
                  <td className="text-center">
                    {rapor.ibadah.score.toFixed(0)}
                  </td>
                  <td className="text-center">{rapor.ibadah.grade}</td>
                </tr>
              </tbody>
            </Table>
          </Section>

          {/* 3. PEMBELAJARAN PESANTREN */}
          <Section title="C. PEMBELAJARAN PESANTREN">
            <Table>
              <thead className="bg-gray-100">
                <tr>
                  <th className="w-10">No</th>
                  <th>Materi</th>
                  <th className="w-24">Nilai</th>
                  <th className="w-32">Predikat</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-center">1</td>
                  <td>Muhadhoroh (Pidato)</td>
                  <td className="text-center">
                    {rapor.muhadhoroh.score.toFixed(0)}
                  </td>
                  <td className="text-center">{rapor.muhadhoroh.grade}</td>
                  <td className="text-xs">
                    {rapor.muhadhoroh.totalSessions} Sesi, Terbaik:{" "}
                    {rapor.muhadhoroh.performances[0]?.theme || "-"}
                  </td>
                </tr>
                <tr>
                  <td className="text-center">2</td>
                  <td>Muhadatsah (Bahasa)</td>
                  <td className="text-center">
                    {rapor.muhadatsah.score.toFixed(0)}
                  </td>
                  <td className="text-center">{rapor.muhadatsah.grade}</td>
                  <td className="text-xs">
                    {rapor.muhadatsah.totalSessions} Sesi
                  </td>
                </tr>
                <tr>
                  <td className="text-center">3</td>
                  <td>Kitab Kuning</td>
                  <td className="text-center">
                    {rapor.kitabProgress.score.toFixed(0)}
                  </td>
                  <td className="text-center">{rapor.kitabProgress.grade}</td>
                  <td className="text-xs">
                    Progress:{" "}
                    {rapor.kitabProgress.progressPercentage.toFixed(0)}%
                  </td>
                </tr>
              </tbody>
            </Table>
          </Section>

          {/* 4. AKHLAK & KEDISIPLINAN */}
          <Section title="D. AKHLAK & KEDISIPLINAN">
            <div className="grid grid-cols-2 gap-4 mb-2">
              <div className="border p-2 rounded">
                <div className="text-xs text-gray-500 uppercase">
                  Kedisiplinan
                </div>
                <div className="font-bold">{rapor.akhlak.behaviorGrade}</div>
                <div className="text-xs mt-1">
                  Poin Pelanggaran: {rapor.akhlak.violationPoints}
                </div>
              </div>
              <div className="border p-2 rounded">
                <div className="text-xs text-gray-500 uppercase">
                  Prestasi/Penghargaan
                </div>
                <div className="font-bold">
                  {rapor.akhlak.totalRewards > 0 ? "ADA" : "-"}
                </div>
                <div className="text-xs mt-1">
                  Poin Penghargaan: {rapor.akhlak.rewardPoints}
                </div>
              </div>
            </div>
          </Section>

          {/* 5. KEHADIRAN */}
          <Section title="E. KEHADIRAN">
            <div className="flex gap-4 text-sm border p-2 justify-between">
              <div>
                Hadir: <strong>{rapor.attendance.presentDays}</strong>
              </div>
              <div>
                Sakit: <strong>{rapor.attendance.sickDays}</strong>
              </div>
              <div>
                Izin: <strong>{rapor.attendance.permitDays}</strong>
              </div>
              <div>
                Alpha: <strong>{rapor.attendance.absentDays}</strong>
              </div>
            </div>
          </Section>

          {/* 6. CATATAN */}
          <Section title="F. CATATAN MUSYRIF / WALI KELAS">
            <div className="border p-4 min-h-[80px] text-sm italic bg-gray-50">
              "
              {rapor.notes ||
                rapor.musyrifNotes ||
                "Terus tingkatkan semangat belajar dan hafalan."}
              "
            </div>
          </Section>
        </div>

        {/* Signatures */}
        <div className="mt-16 grid grid-cols-3 gap-8 text-center text-sm break-inside-avoid">
          <div>
            <p className="mb-16">
              Mengetahui,
              <br />
              Orang Tua / Wali Santri
            </p>
            <p className="font-bold border-b border-black inline-block min-w-[150px]">
              ( .................................... )
            </p>
          </div>
          <div>
            <p className="mb-16">Musyrif / Wali Kelas</p>
            <p className="font-bold border-b border-black inline-block min-w-[150px]">
              ( .................................... )
            </p>
          </div>
          <div>
            <p className="mb-1">
              Cipansor,{" "}
              {safeFormat(new Date(rapor.generatedAt), "d MMMM yyyy", {
                locale: localeId,
              })}
            </p>
            <p className="mb-16">Kepala Sekolah</p>
            <p className="font-bold border-b border-black inline-block min-w-[150px]">
              H. Ahmad Fulan, Lc., M.Pd.
            </p>
            <p>NIY. 123456789</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Subcomponents for cleaner code
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="break-inside-avoid">
      <h4 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden border border-black text-sm">
      <table className="w-full">{children}</table>
    </div>
  );
}

// Helper for predicates (if not available in rapor data)
function getPredicate(score: number) {
  if (score >= 90) return "Mumtaz";
  if (score >= 80) return "Jayyid Jiddan";
  if (score >= 70) return "Jayyid";
  if (score >= 60) return "Maqbul";
  return "Rasib";
}

export default function RaporPrintPage() {
  return (
    <main id="main-content">
      <RaporPrintPageContent />
    </main>
  );
}
