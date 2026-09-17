import { describe, it, expect } from 'vitest';
import {
  canReadFoundationDecision,
  FOUNDATION_DECISION_READ_ROLES,
} from './foundation-decision-access';

/**
 * Akses baca keputusan organ yayasan punya DUA jalur, dan jalur kedua tidak
 * dapat diungkapkan lewat `authorize(...READ)` di middleware.
 *
 * Middleware memeriksa `req.user.roleCode` HARI INI; keanggotaan keputusan
 * terkunci pada snapshot saat keputusan dibuat. Anggota snapshot yang kemudian
 * berpindah peran tetap berhak membaca (dan menandatangani) keputusan itu —
 * sementara pihak luar tanpa hubungan tetap harus ditolak.
 */
describe('canReadFoundationDecision', () => {
  const members = [{ userId: 'u-member' }];

  it('mengizinkan peran yayasan yang memang berhak membaca', () => {
    for (const roleCode of FOUNDATION_DECISION_READ_ROLES) {
      expect(canReadFoundationDecision({ id: 'someone', roleCode }, members)).toBe(true);
    }
  });

  it('mengizinkan anggota snapshot walau rolenya di luar READ', () => {
    expect(canReadFoundationDecision({ id: 'u-member', roleCode: 'GURU' }, members)).toBe(true);
  });

  it('menolak pihak luar tanpa hubungan dan tanpa peran READ', () => {
    expect(canReadFoundationDecision({ id: 'outsider', roleCode: 'GURU' }, members)).toBe(false);
  });

  it('menolak ketika daftar anggota kosong dan rolenya di luar READ', () => {
    expect(canReadFoundationDecision({ id: 'outsider', roleCode: 'STAFF' }, [])).toBe(false);
  });
});
