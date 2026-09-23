import { describe, it, expect } from 'vitest';
import {
  createFoundationDecisionSchema,
  setFoundationDecisionPublicationSchema,
  upsertFoundationRuleSchema,
  finalizeFoundationDecisionSchema,
} from '../foundation-decisions.schema';

/**
 * Ambang kuorum nol adalah cara mengesahkan keputusan tanpa satu suara pun.
 *
 * `requiredCount(mode, 0, pool)` menghasilkan 0, sehingga `approvedCount (0)
 * >= decisionRequired (0)` dan mesin kuorum mengembalikan APPROVED sebelum ada
 * yang menyetujui — lalu finalize menyegelnya. Batas bawah skema karena itu
 * harus > 0, bukan >= 0; memakai `.min(0)` membuka kembali lubang yang sama
 * lewat konfigurasi aturan alih-alih lewat mesin.
 */
describe('upsertFoundationRuleSchema — ambang kuorum wajib > 0', () => {
  const base = {
    organType: 'PEMBINA' as const,
    // MEETING: sirkuler dikunci ke MUTLAK oleh kontrak (lihat describe di
    // bawah), sehingga uji ambang di sini memakai rapat agar mode non-mutlak
    // tetap dapat diuji.
    decisionKind: 'MEETING' as const,
  };

  it('menolak quorumPresentValue = 0', () => {
    const res = upsertFoundationRuleSchema.safeParse({ ...base, quorumPresentValue: 0 });
    expect(res.success).toBe(false);
  });

  it('menolak quorumDecisionValue = 0', () => {
    const res = upsertFoundationRuleSchema.safeParse({ ...base, quorumDecisionValue: 0 });
    expect(res.success).toBe(false);
  });

  it('menerima nilai yang KONSISTEN dengan modenya', () => {
    const res = upsertFoundationRuleSchema.safeParse({
      ...base,
      // MEETING, bukan CIRCULAR: sirkuler dikunci ke MUTLAK (lihat describe di
      // bawah), sehingga mode non-mutlak hanya sah untuk rapat.
      decisionKind: 'MEETING',
      quorumPresentMode: 'TWO_THIRDS',
      quorumPresentValue: 2 / 3,
      quorumDecisionMode: 'THREE_QUARTERS',
      quorumDecisionValue: 0.75,
    });
    expect(res.success).toBe(true);
  });

  /**
   * Item review #7 — mode yang mengikat, nilai harus mengikutinya.
   *
   * `TWO_THIRDS` dengan value 0.5 adalah aturan yang menyamar: labelnya
   * menjanjikan dua pertiga sementara mesin kuorum mengevaluasi "≥ setengah".
   * Skema harus menolak kombinasi yang bertentangan agar ambang yang
   * TERSIMPAN selalu dapat dipercaya dari labelnya.
   */
  it('menolak TWO_THIRDS dengan nilai 0.5 yang bertentangan', () => {
    const res = upsertFoundationRuleSchema.safeParse({
      ...base,
      quorumDecisionMode: 'TWO_THIRDS',
      quorumDecisionValue: 0.5,
    });
    expect(res.success).toBe(false);
  });

  it('menolak MUTLAK dengan nilai kurang dari 1', () => {
    const res = upsertFoundationRuleSchema.safeParse({
      ...base,
      quorumPresentMode: 'MUTLAK',
      quorumPresentValue: 0.75,
    });
    expect(res.success).toBe(false);
  });

  it('menerima nilai bawaan 0.5 (MAJORITY)', () => {
    const res = upsertFoundationRuleSchema.safeParse(base);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.quorumPresentValue).toBe(0.5);
      expect(res.data.quorumDecisionValue).toBe(0.5);
    }
  });

  /**
   * Finding 8 — sirkuler wajib mufakat, dan itu ditegakkan di KONTRAK.
   *
   * Default `base` di atas memakai `decisionKind: 'CIRCULAR'` dengan mode
   * MAJORITY 0.5; uji ini mengunci bahwa kombinasi itu DITOLAK. Sebelumnya
   * hanya UI yang menyembunyikan opsi non-mufakat, sehingga aturan mayoritas
   * untuk sirkuler tetap dapat disimpan lewat API — dan mesin kuorum
   * mengevaluasinya, mengesahkan sirkuler tanpa mufakat.
   */
  it('menolak sirkuler dengan mode mayoritas (harus MUTLAK)', () => {
    const res = upsertFoundationRuleSchema.safeParse({
      organType: 'PEMBINA',
      decisionKind: 'CIRCULAR',
      quorumPresentMode: 'MAJORITY',
      quorumPresentValue: 0.5,
      quorumDecisionMode: 'MAJORITY',
      quorumDecisionValue: 0.5,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(res.error.issues)).toMatch(/sirkuler wajib mufakat/i);
    }
  });

  it('menolak sirkuler yang hanya salah satu sisi non-MUTLAK', () => {
    const present = upsertFoundationRuleSchema.safeParse({
      organType: 'PEMBINA',
      decisionKind: 'CIRCULAR',
      quorumPresentMode: 'MAJORITY',
      quorumPresentValue: 0.5,
      quorumDecisionMode: 'MUTLAK',
      quorumDecisionValue: 1,
    });
    expect(present.success).toBe(false);
    const decision = upsertFoundationRuleSchema.safeParse({
      organType: 'PEMBINA',
      decisionKind: 'CIRCULAR',
      quorumPresentMode: 'MUTLAK',
      quorumPresentValue: 1,
      quorumDecisionMode: 'MAJORITY',
      quorumDecisionValue: 0.5,
    });
    expect(decision.success).toBe(false);
  });

  it('menerima sirkuler dengan MUTLAK di kedua sisi', () => {
    const res = upsertFoundationRuleSchema.safeParse({
      organType: 'PEMBINA',
      decisionKind: 'CIRCULAR',
      quorumPresentMode: 'MUTLAK',
      quorumPresentValue: 1,
      quorumDecisionMode: 'MUTLAK',
      quorumDecisionValue: 1,
    });
    expect(res.success).toBe(true);
  });

  it('menolak nilai di atas 1', () => {
    const res = upsertFoundationRuleSchema.safeParse({ ...base, quorumDecisionValue: 1.5 });
    expect(res.success).toBe(false);
  });
});

/**
 * Finalisasi tidak memakai passphrase pengguna.
 *
 * Yang dibubuhkan adalah e-seal Yayasan, yang kunci privatnya disegel
 * passphrase server-side. Kontrak yang menuntut passphrase berarti menuntut
 * rahasia yang tidak dipakai, dan mengundang klien mengirimkannya. Otorisasinya
 * adalah peran (WRITE) di rute.
 */
describe('finalizeFoundationDecisionSchema', () => {
  it('menerima body kosong (otorisasi lewat peran, bukan passphrase)', () => {
    expect(finalizeFoundationDecisionSchema.safeParse({}).success).toBe(true);
  });
});

/**
 * Regresi Flags–Investigation — typo `decisionType` mengubah authority diam-diam.
 *
 * `decisionType` dulu string bebas: `"pengesahan-rancana-kerja"` lolos validasi
 * di edge, lalu matriks kewenangan memetakannya (lewat fallback lama) ke organ
 * Pembina. Sekarang ia `z.enum` kosakata bersama, sehingga typo ditolak
 * SEBELUM service sempat memutuskan organ yang berwenang.
 */
describe('createFoundationDecisionSchema — decisionType terkontrol', () => {
  const base = {
    organType: 'PENGAWAS' as const,
    kind: 'MEETING' as const,
    subject: 'Pemberhentian sementara',
    body: 'Naskah keputusan yang cukup panjang.',
    decisionType: 'pemberhentian-sementara-pengurus',
  };

  it('menerima jenis yang ada di kosakata bersama', () => {
    expect(createFoundationDecisionSchema.safeParse(base).success).toBe(true);
  });

  it('menolak typo jenis keputusan', () => {
    const res = createFoundationDecisionSchema.safeParse({
      ...base,
      decisionType: 'pemberhentian-sementara-penguruz',
    });
    expect(res.success).toBe(false);
  });

  it('menolak jenis tak dikenal (bukan fallback ke Pembina)', () => {
    const res = createFoundationDecisionSchema.safeParse({
      ...base,
      decisionType: 'apa-pun',
    });
    expect(res.success).toBe(false);
  });
});

describe('setFoundationDecisionPublicationSchema', () => {
  it('menerima PRIVATE dan PUBLIC', () => {
    expect(
      setFoundationDecisionPublicationSchema.safeParse({ publication: 'PRIVATE' }).success
    ).toBe(true);
    expect(
      setFoundationDecisionPublicationSchema.safeParse({ publication: 'PUBLIC' }).success
    ).toBe(true);
  });

  it('menolak nilai klasifikasi lain', () => {
    expect(setFoundationDecisionPublicationSchema.safeParse({ publication: 'DRAFT' }).success).toBe(
      false
    );
    expect(setFoundationDecisionPublicationSchema.safeParse({}).success).toBe(false);
  });
});
