# dokumentasi-bergambar

> Keputusan pengguna 2026-09-29 — skill dokumen dan skill tangkapan layar tetap dua skill dengan satu jalur kerja (dokumen memanggil rig `screenshot-roles`, tidak menyalinnya); cakupan penuh (semua peran, semua proses bisnis) dirancang di skill; hanya gambar yang tersemat di dokumen masuk git.

- **Bentuk.** `dokumen-aplikasi-cipansor` menulis dan memeriksa; `screenshot-roles` memegang alat tangkap (`screenshot-flow.ts`: `flow`, `atlas`, `plan`); `stack` menyalakan aplikasi. Kontrak antaranya: `flow-report.json`/`atlas-report.json` dan `screens/manifest.json`. Digabung menjadi satu skill ditolak: QA per peran dan before/after (aturan emas 10) kehilangan rumahnya, dan skill menjadi terlalu panjang bagi model kecil.
- **Tiga lapis gambar.** Kartu tugas (gambar per layar penentu, ≤ 4), alur proses (satu gambar per tahap), Atlas Layar (satu gambar per halaman per akun; artefak, tidak di-commit). Riset: Google (gambar secukupnya, alt yang bermakna) dan Microsoft (tangkapan layar bila menghemat kata) — tautan di `tangkapan-layar.md`.
- **Penyimpanan.** Hanya gambar yang dirujuk naskah (dikecilkan ≤ 1280 px) masuk git; atlas dan tangkapan mentah tidak. Sebabnya: repo publik sampai rilis, riwayat git menyimpan selamanya, `docs/images` sudah 12 MB untuk 78 gambar.
- **Bukti.** Setiap langkah alur menegaskan teks yang terlihat (`see`) sebelum foto; kartu tanpa ⚠ (T1) wajib bergambar (`check_docs.py`).
- **Belum dikerjakan (2026-09-29).** Hanya skill yang diperbarui; alur dan gambar untuk semua peran/proses belum dibuat (uji oleh DeepSeek). Dua alur contoh sudah lolos pada aplikasi berjalan.
