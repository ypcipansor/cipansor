import { describe, it, expect } from 'vitest';
import { predikatKinerja, ratingOf } from '../predikat';

describe('predikat kinerja (kuadran PermenPANRB 6/2022)', () => {
  it('menilai hasil kerja dan perilaku terhadap ekspektasi, bukan menjumlahkannya', () => {
    expect(ratingOf(95)).toBe('DI_ATAS');
    expect(ratingOf(90)).toBe('DI_ATAS');
    expect(ratingOf(75)).toBe('SESUAI');
    expect(ratingOf(70)).toBe('SESUAI');
    expect(ratingOf(69.9)).toBe('DI_BAWAH');
  });

  it('TIDAK membiarkan hasil kerja tinggi menutupi perilaku yang buruk', () => {
    // Inilah alasan kuadran dipakai dan bukan penjumlahan berbobot.
    // Dengan rumus lama, 100 × 0,6 + 50 × 0,4 = 80 — terbaca "baik".
    // Kuadran menyebutnya apa adanya: butuh perbaikan.
    const rumusLama = 100 * 0.6 + 50 * 0.4;
    expect(rumusLama).toBe(80);

    const hasil = predikatKinerja(100, 50);
    expect(hasil.hasilKerja).toBe('DI_ATAS');
    expect(hasil.perilakuKerja).toBe('DI_BAWAH');
    expect(hasil.predikat).toBe('BUTUH_PERBAIKAN');
    expect(hasil.label).toBe('Butuh Perbaikan');
  });

  it('tidak pernah memberi predikat "Baik" ketika perilaku di bawah ekspektasi', () => {
    for (const skorHasil of [100, 95, 90, 80, 70, 60, 0]) {
      const { predikat } = predikatKinerja(skorHasil, 40);
      expect(['BUTUH_PERBAIKAN', 'SANGAT_KURANG']).toContain(predikat);
    }
  });

  it('memberi Sangat Baik hanya bila keduanya di atas ekspektasi', () => {
    expect(predikatKinerja(95, 95).predikat).toBe('SANGAT_BAIK');
    expect(predikatKinerja(95, 80).predikat).toBe('BAIK');
    expect(predikatKinerja(80, 95).predikat).toBe('BAIK');
  });

  it('membedakan Kurang dari Sangat Kurang', () => {
    expect(predikatKinerja(50, 75).predikat).toBe('KURANG');
    expect(predikatKinerja(50, 50).predikat).toBe('SANGAT_KURANG');
  });
});
