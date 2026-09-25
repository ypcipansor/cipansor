# chatbot-retrieval-settled

> Korpus chatbot 628 token — ambang RAG ~100 ribu, jadi seluruh korpus dikirim dan BM25 tidak lagi menjadi gerbang; angka biayanya, dan pemicu untuk meninjau ulang

Diputuskan sebagai PR #475 (digabung 2026-09-04, **digelar ke produksi
2026-09-05**). Rinciannya lengkap di
`docs/planning/chatbot-design.md` §1 ("REVISED AGAIN"); ini penunjuknya, supaya
sesi berikutnya **tidak mengulang perdebatannya dari selera**.

**Angka yang menyelesaikannya:** korpus publik asisten = **2.513 karakter,
±628 token, 8 entri.** Praktik terkini menaruh ambang "masukkan saja ke konteks"
di **~100 ribu token / beberapa ratus dokumen**. Kita dua orde besaran di
bawahnya, jadi memilih sebagian entri tidak menghemat apa pun yang terukur — dan
harganya satu mode kegagalan yang sampai ke pengunjung: `ada`, `apa`, `saja`
semuanya kata henti, sehingga "ada informasi apa saja" menyisakan satu kata,
nol entri cocok, dan layanan menolak **tanpa pernah memanggil model**.

Sekarang: seluruh korpus masuk ke setiap prompt; penolakan ditulis model;
`sources` diambil dari baris `SUMBER:` yang model tulis sendiri (aturan 7),
disaring lawan korpus, dengan BM25 sebagai cadangan.

**Ongkosnya, diukur bukan ditaksir** (DeepSeek-V4-Flash-0731, 2026-09-04):
999 → 3.300 token prompt untuk pertanyaan meta, 1.385 → 3.317 untuk pertanyaan
dua bagian. Produksi rata-rata 1.174 token/panggilan sebelumnya. Pada harga
terpasang (0,19 / 0,51 USD per juta): **±0,30 → ±0,70 USD per 1.000 pertanyaan.**

**Ramalan cache itu DIUKUR dan MELESET (2026-09-05).** Harapannya: korpus yang
selalu sama membuat awalan prompt konstan, bentuk yang ditagih 0,028 alih-alih
0,19. Kenyataannya tiga panggilan pertama sesudah penggelaran — awalan sama
persis, dalam sepuluh menit — dilaporkan **0 dari 10.225 token prompt
ter-cache**, padahal sehari sebelumnya 2.304 dari 10.566 (21,8%). Angka nol itu
laporan penyedia, bukan pembacaan kita yang bolong: adaptor membaca
`prompt_tokens_details.cached_tokens` **dan** `prompt_cache_hit_tokens`.
Dugaan: yang ter-cache kemarin adalah prompt yang identik seluruhnya
(pertanyaan berulang), bukan awalan yang dibagi antar pertanyaan berbeda.
Sampel tiga panggilan masih kecil — **periksa ulang sesudah ada trafik
pengunjung sungguhan** sebelum menyebutnya permanen. Taksiran biaya di atas
tidak berubah, karena sudah dihitung pada harga penuh.

**Yang DITOLAK, dengan alasannya** (jangan riset ulang): hybrid BM25+embedding
dengan RRF (butuh indeks vektor untuk memeringkat 8 dokumen yang toh semuanya
dikirim), query rewriting/HyDE (satu panggilan model tambahan per pertanyaan),
agentic RAG (2–4× panggilan dan latensi pada jalur yang sudah 8–33 detik), dan
membiarkan model membaca situs publik langsung (mengubah isi halaman jadi
saluran perintah).

**Pemicu peninjauan ulang:** korpus melewati ~100 ribu token atau beberapa ratus
dokumen — misalnya bila seluruh artikel situs, naskah dinas, dan FAQ SPMB ikut
diindeks. Tidak sebelum itu.
