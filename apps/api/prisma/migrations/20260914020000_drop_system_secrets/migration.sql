-- Hapus modul SystemSecret sepenuhnya.
--
-- Modul manajemen "System Secrets" ternyata tidak pernah dipakai: tidak ada
-- konsumen implementasinya di frontend maupun backend, dan menyimpan kredensial
-- terenkripsi di dalam basis data adalah praktik keamanan yang justru ingin
-- dihindari. Rute /secrets, halaman dashboard, komponen, navigasi, dan key
-- lokal telah dihapus dari schema.prisma pada PR ini.
--
-- Mengikuti preseden drop_pkg_module (20260726000000): tabel dihapus total,
-- tidak diubah nama menjadi arsip. Sistem ini belum punya data sungguhan yang
-- perlu diselamatkan, dan tabel yatim tanpa model Prisma cuma menjadi drift
-- abadi di setiap pemeriksaan sebelum penggelaran.
--
-- DROP mewarisi referensi FK (system_secrets_unit_id_fkey) dan kedua indeks
-- (system_secrets_unit_id_idx, system_secrets_unit_id_key_key) yang telah
-- menjadi bagian dari CREATE TABLE / CREATE INDEX pada baseline 0_init.

DROP TABLE IF EXISTS "system_secrets" CASCADE;