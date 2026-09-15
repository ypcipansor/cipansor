-- Hapus modul PKG sepenuhnya.
--
-- PKG (Penilaian Kinerja Guru) digantikan performance-management: Perjanjian
-- Kinerja dengan indikator berjenjang, evaluasi berkala, penilaian perilaku
-- SAFTI, dan predikat kinerja berbasis kuadran.
--
-- Versi pertama migrasi ini MENGGANTI NAMA tabelnya menjadi archived_pkg_*
-- demi menyimpan rekam jejak. Itu dibatalkan atas keputusan pengguna
-- (2026-09-05): sistem ini belum dipakai sungguhan, jadi tidak ada rekam jejak
-- yang perlu diselamatkan — yang ada hanyalah satu baris demo — dan tabel
-- arsip tanpa model Prisma justru menjadi beban: ia muncul sebagai drift abadi
-- di setiap pemeriksaan sebelum penggelaran.
--
-- Tidak ada jalur mundur dan tidak ada lapisan kompatibilitas: rute /pkg,
-- halaman pengalihnya, dan pengalihan di next.config ikut dihapus.
--
-- Data yang ada di produksi saat migrasi ini ditulis: 1 periode, 1 evaluasi,
-- 1 rincian, 1 dokumen. Cadangannya diambil lebih dahulu ke
-- ~/cipansor-pkg-data-20260905.sql di host produksi.

DROP TABLE IF EXISTS "pkg_documents" CASCADE;
DROP TABLE IF EXISTS "pkg_details" CASCADE;
DROP TABLE IF EXISTS "pkg_evaluations" CASCADE;
DROP TABLE IF EXISTS "pkg_periods" CASCADE;
