-- Nyatakan cara realisasi bulanan menjadi capaian setahun.
--
-- Sebelum ini realisasi SELALU dijumlahkan, apa pun satuannya. Terlihat di
-- layar saat menjalankan alurnya sungguhan: indikator "Ketuntasan capaian
-- pembelajaran" bertarget 85 persen, dievaluasi 88 lalu 80, menampilkan
-- "Realisasi YTD 168 persen". Angka yang mustahil, dan tidak ada satu pun
-- pesan yang menandainya.
--
-- Sifat indikator karena itu dinyatakan, bukan ditebak dari teks satuannya:
-- KUMULATIF untuk yang menumpuk (kegiatan, dokumen, juz), RATA_RATA untuk
-- persentase dan indeks, TERAKHIR untuk keadaan akhir. Bawaannya KUMULATIF,
-- yaitu perilaku lama, sehingga baris yang sudah ada tidak berubah artinya.

-- CreateEnum
CREATE TYPE "IndicatorAggregation" AS ENUM ('KUMULATIF', 'RATA_RATA', 'TERAKHIR');

-- AlterTable
ALTER TABLE "pk_indicators" ADD COLUMN     "aggregation" "IndicatorAggregation" NOT NULL DEFAULT 'KUMULATIF';


-- Indikator yang sudah terlanjur ada dengan satuan persentase diperbaiki
-- sekaligus: menjumlahkan persen tidak pernah benar untuk mereka.
UPDATE "pk_indicators"
   SET "aggregation" = 'RATA_RATA'
 WHERE lower("unit") IN ('persen', '%', 'persentase', 'rasio', 'indeks', 'nilai', 'skor');

-- Perbaiki pula capaian yang TERLANJUR tersimpan salah.
--
-- `realization` hanya dihitung ulang ketika sebuah evaluasi disetujui, jadi
-- tanpa langkah ini angka 168 persen itu akan tetap terpampang sampai ada
-- persetujuan berikutnya — bisa berbulan-bulan.
UPDATE "pk_indicators" i
   SET "realization" = COALESCE(x.avg_realisasi, 0)
  FROM (
        SELECT ie."indicator_id" AS id, AVG(ie."realization") AS avg_realisasi
          FROM "pk_indicator_evaluations" ie
          JOIN "pk_evaluations" e ON e."id" = ie."evaluation_id"
         WHERE e."status" = 'APPROVED'
         GROUP BY ie."indicator_id"
       ) x
 WHERE x.id = i."id" AND i."aggregation" = 'RATA_RATA';
