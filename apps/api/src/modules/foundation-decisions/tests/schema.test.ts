import { describe, it, expect } from 'vitest';
import {
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
    decisionKind: 'CIRCULAR' as const,
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
