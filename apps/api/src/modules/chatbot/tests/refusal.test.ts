import { describe, it, expect } from 'vitest';
import { looksLikeRefusal } from '../refusal';

/**
 * Kalimat di bawah ini BUKAN karangan.
 *
 * Semuanya dipanen dari uji ke DeepSeek-V4-Flash-0731 yang sungguhan pada
 * 2026-09-04, memakai prompt yang sama persis dengan yang berjalan di produksi.
 * Detektor yang dikalibrasi terhadap kalimat rekaan akan selalu cocok dengan
 * kalimat rekaan; yang menentukan adalah kalimat yang benar-benar ditulis model
 * ini, dengan persona ini.
 */
describe('looksLikeRefusal', () => {
  describe('mengenali penolakan sungguhan', () => {
    const declines = [
      // Ditanya apakah biaya pendaftaran bisa dikembalikan.
      'saya mohon maaf karena informasi tersebut tidak tersedia dalam informasi resmi yang saya miliki.',
      // Ditanya harga emas hari ini.
      'Untuk informasi harga emas hari ini, saya tidak memiliki datanya.',
      // Jawaban SEBAGIAN: lokasi dijawab, biaya tidak. Tetap sebuah penolakan,
      // dan justru itu yang ingin dilihat pengelola di daftar percakapan.
      'Mengenai biaya pendaftaran, saya mohon maaf, informasi tersebut tidak tercantum dalam data yang saya miliki.',
      // Penolakan yang ditulis layanan sendiri, tanpa model.
      'Mohon maaf, untuk pertanyaan tersebut saya belum memiliki informasinya 🙏',
      // Penyedia stub.
      'Maaf, saya belum memiliki informasi untuk menjawab pertanyaan itu.',
      // Penanya berbahasa Inggris.
      "I'm sorry, I don't have that information.",
    ];

    for (const answer of declines) {
      it(`«${answer.slice(0, 48)}…»`, () => expect(looksLikeRefusal(answer)).toBe(true));
    }
  });

  describe('tidak menuduh jawaban yang benar', () => {
    const answers = [
      // Jebakan yang membuat pola lama harus diperketat: kalimat ini MENJAWAB,
      // dan subjek "tidak dapat"-nya adalah biayanya, bukan asistennya.
      'Biaya pendaftaran tidak dapat dikembalikan, Bapak/Ibu.',
      'Pendaftaran belum dibuka untuk gelombang berikutnya.',
      'Santri tidak diperkenankan membawa telepon genggam.',
      'Berkas yang belum lengkap dapat dilengkapi kemudian.',
      // Jawaban meta yang dilaporkan pengguna — pemicu seluruh perbaikan ini.
      'Tentu, Bapak/Ibu. Berikut informasi yang tersedia di asisten ini seputar Pesantren Cipansor 😊',
    ];

    for (const answer of answers) {
      it(`«${answer.slice(0, 48)}…»`, () => expect(looksLikeRefusal(answer)).toBe(false));
    }
  });
});
