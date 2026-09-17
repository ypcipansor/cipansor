import { describe, it, expect } from 'vitest';
import {
  canReadFoundationDecision,
  FOUNDATION_DECISION_READ_ROLES,
  foundationDecisionListWhere,
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

/**
 * Regresi audit #9 — predikat DAFTAR harus setara dengan `canReadFoundationDecision`.
 *
 * Daftar dulu memakai `authorize(...READ)` di middleware, jadi anggota snapshot
 * yang rolenya sudah berubah dapat MEMBUKA keputusan (detail memakai jalur
 * snapshot) tetapi tidak dapat MENEMUKANNYA dari daftar. Predikat ini
 * memindahkan aturan yang sama ke query Prisma.
 *
 * Kesetaraan diuji langsung dengan menyaring sekumpulan keputusan contoh
 * memakai predikat itu, lalu membandingkan hasilnya dengan keputusan yang
 * memang boleh dibaca per `canReadFoundationDecision` — bukan sekadar
 * memeriksa bentuk objek WHERE-nya.
 */
describe('foundationDecisionListWhere', () => {
  const decisions = [
    { id: 'd-member', members: [{ userId: 'u-member' }] },
    { id: 'd-other', members: [{ userId: 'u-other' }] },
  ];

  /** Prisma `members.some(userId = actor.id)` yang diterjemahkan. */
  function visible(actor: { id: string; roleCode: string }) {
    const where = foundationDecisionListWhere(actor) as {
      members?: { some?: { userId?: string } };
    };
    // Cabang "semua" TIDAK boleh diungkapkan sebagai `OR: [{}]`: objek kosong
    // di dalam `OR` cocok dengan NOL baris di Prisma 7, sehingga Super Admin
    // justru melihat daftar kosong. Predikat "semua" adalah `{}` tanpa klausa.
    const seesAll = Object.keys(where).length === 0;
    if (seesAll) return decisions.map((d) => d.id);
    return decisions
      .filter((d) => where.members?.some?.userId === d.members[0].userId)
      .map((d) => d.id);
  }

  it('peran READ memakai predikat "semua" tanpa klausa OR, bukan OR: [{}]', () => {
    // Regresi: bentuk lama `{ OR: [{}, {members...}] }` membuat Prisma
    // mengembalikan nol baris untuk peran READ — daftar kosong bagi Super Admin.
    const where = foundationDecisionListWhere({ id: 'anyone', roleCode: 'SUPER_ADMIN' });
    expect(where).toEqual({});
    expect(where).not.toHaveProperty('OR');
  });

  it('peran READ melihat seluruh daftar', () => {
    for (const roleCode of FOUNDATION_DECISION_READ_ROLES) {
      expect(visible({ id: 'anyone', roleCode })).toEqual(['d-member', 'd-other']);
    }
  });

  it('mantan anggota hanya melihat keputusan snapshot miliknya', () => {
    expect(visible({ id: 'u-member', roleCode: 'GURU' })).toEqual(['d-member']);
  });

  it('outsider tidak melihat apa pun', () => {
    expect(visible({ id: 'outsider', roleCode: 'GURU' })).toEqual([]);
  });

  it('setara dengan canReadFoundationDecision untuk setiap aktor', () => {
    const actors = [
      { id: 'u-member', roleCode: 'GURU' },
      { id: 'outsider', roleCode: 'GURU' },
      { id: 'u-other', roleCode: 'STAFF' },
      { id: 'anyone', roleCode: 'YAYASAN_KETUA' },
    ];
    for (const actor of actors) {
      const viaList = new Set(visible(actor));
      for (const d of decisions) {
        expect(viaList.has(d.id)).toBe(canReadFoundationDecision(actor, d.members));
      }
    }
  });
});
