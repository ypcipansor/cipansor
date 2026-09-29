# Evaluasi dan perbaikan skill

Ditulis 29 September 2026 setelah menjalankan skill pada commit `aefc719`.
Perbaikan di bawah sudah diterapkan pada skrip di folder `scripts/`.

## Cacat yang diperbaiki

### 1. `build_docs.py` — semua diagram gagal dirender

`render_mermaid()` memanggil `mmdc` dengan bendera **`-w`** untuk membatasi lebar:

```python
[mmdc, "-i", …, "-o", …, "-p", …, "-b", "white", "-s", "2", "-w", "1200"]
```

mermaid-cli versi 12.x **tidak mengenal `-w`** dan keluar dengan
`error: unknown option '-w'`, sehingga setiap diagram jatuh ke cabang gagal dan
dokumen terbit tanpa gambar. Diganti dengan bendera yang benar:

```python
… "-b", "white", "-s", "2", "--size", "1200"
```

`--size` dibaca sebagai lebar/tinggi maksimum, sesuai maksud aslinya.

Gejala bila tidak diperbaiki: `PERINGATAN: diagram '…' gagal dirender: error:
unknown option '-w'`, lalu `diagram: 0 dirender, N gagal`.

### 2. `build_docs.py` — keterangan diagram tak pernah tampil

Baris pertama blok mermaid, `%% caption: …`, sudah diambil sebagai judul gambar.
Namun pandoc dijalankan dengan pembaca `commonmark_x`, yang **membuang
keterangan gambar** (alt); hanya pembaca `markdown` yang memakai gaya
`Image Caption`. Akibatnya keterangan tidak pernah muncul di `.docx`.

Diperbaiki dengan menulis keterangan secara eksplisit setelah gambar, sehingga
tampil pada kedua pembaca:

```python
out.append(f"![{caption}]({png}){attr}")
if cap:
    out.append(f"\n*Gambar: {caption}*\n")
```

## Yang diverifikasi (bukan cacat)

- `collect_facts.py`, `scan_sensitive.py`, `update_toc.py` berjalan benar.
- `update_toc.py` mengisi daftar isi lewat LibreOffice **bila** `LD_LIBRARY_PATH`
  tidak diarahkan ke `/usr/lib/libreoffice/program`. Di lingkungan uji, variabel
  itu membuat `soffice` gagal start; tanpa variabel, isi daftar isi berhasil.
  Ini jebakan lingkungan, bukan logika skrip.
- Angka yang diukur pada `aefc719`: 93 modul API, 289 model, 53 kode peran,
  435 halaman web — cocok dengan dokumen yang dihasilkan.
