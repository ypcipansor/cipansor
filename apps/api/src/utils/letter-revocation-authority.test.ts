import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  RevocationRank,
  mayRevokeSignature,
  rankOf,
  whoMayRevoke,
  type RevocationParty,
} from '@cipansor/shared';

const p = (userId: string, roleCode: string | null): RevocationParty => ({ userId, roleCode });

const PEMBINA = p('pembina-1', RoleCode.YAYASAN_PEMBINA);
const PEMBINA_2 = p('pembina-2', RoleCode.YAYASAN_PEMBINA);
const PENGAWAS = p('pengawas-1', RoleCode.YAYASAN_PENGAWAS);
const PENGAWAS_2 = p('pengawas-2', RoleCode.YAYASAN_PENGAWAS);
const KETUA = p('ketua-1', RoleCode.YAYASAN_KETUA);
const SEKRETARIS = p('sekretaris-1', RoleCode.YAYASAN_SEKRETARIS);
const KEPSEK = p('kepsek-1', RoleCode.SMPIT_KEPALA_SEKOLAH);
const GURU = p('guru-1', RoleCode.SMPIT_GURU);
const SUPER_ADMIN = p('admin-1', RoleCode.SUPER_ADMIN);

describe('kedudukan jabatan', () => {
  it('menempatkan organ yayasan pada urutannya', () => {
    expect(rankOf(RoleCode.YAYASAN_PEMBINA)).toBe(RevocationRank.PEMBINA);
    expect(rankOf(RoleCode.YAYASAN_PENGAWAS)).toBe(RevocationRank.PENGAWAS);
    expect(rankOf(RoleCode.YAYASAN_KETUA)).toBe(RevocationRank.PENGURUS);
  });

  it('menganggap jabatan lain sebagai jabatan unit', () => {
    expect(rankOf(RoleCode.SMPIT_KEPALA_SEKOLAH)).toBe(RevocationRank.UNIT);
    expect(rankOf(null)).toBe(RevocationRank.UNIT);
    expect(rankOf('PERAN_YANG_BELUM_ADA')).toBe(RevocationRank.UNIT);
  });
});

describe('menarik tanda tangan sendiri', () => {
  it.each([PEMBINA, PENGAWAS, KETUA, KEPSEK, GURU])(
    'selalu boleh, apa pun jabatannya ($roleCode)',
    (who) => {
      expect(mayRevokeSignature(who, who)).toBe(true);
    }
  );
});

describe('kewenangan pengawasan', () => {
  it('Pengawas mencabut naskah Pengurus', () => {
    expect(mayRevokeSignature(KETUA, PENGAWAS)).toBe(true);
    expect(mayRevokeSignature(SEKRETARIS, PENGAWAS)).toBe(true);
  });

  it('Pengawas mencabut naskah jabatan unit', () => {
    expect(mayRevokeSignature(KEPSEK, PENGAWAS)).toBe(true);
    expect(mayRevokeSignature(GURU, PENGAWAS)).toBe(true);
  });

  /**
   * Pembina berada di luar pengawasan Pengawas. Membolehkannya akan membalik
   * kedudukan organ yang justru dipisahkan Pasal 29.
   */
  it('Pengawas TIDAK mencabut naskah Pembina', () => {
    expect(mayRevokeSignature(PEMBINA, PENGAWAS)).toBe(false);
  });

  it('Pengawas lain tidak mencabut naskah Pengawas', () => {
    expect(mayRevokeSignature(PENGAWAS, PENGAWAS_2)).toBe(false);
  });
});

/**
 * Menganulir naskah organ pelaksana adalah perbuatan pengawasan, bukan
 * perbuatan pelaksanaan. Ketua memimpin organ yang menerbitkannya; memberinya
 * kewenangan menganulir berarti organ pelaksana menganulir pekerjaannya
 * sendiri.
 */
describe('organ pelaksana tidak menganulir', () => {
  it('Ketua tidak mencabut naskah Sekretaris', () => {
    expect(mayRevokeSignature(SEKRETARIS, KETUA)).toBe(false);
  });

  it('Ketua tidak mencabut naskah kepala sekolah', () => {
    expect(mayRevokeSignature(KEPSEK, KETUA)).toBe(false);
  });

  it('kepala sekolah tidak mencabut naskah gurunya', () => {
    expect(mayRevokeSignature(GURU, KEPSEK)).toBe(false);
  });
});

describe('kesinambungan jabatan Pembina', () => {
  /**
   * Tanpa ini, naskah seorang Pembina yang berhenti menjabat tidak dapat
   * dicabut selamanya: tidak ada organ di atasnya untuk dimintai.
   */
  it('Pembina mencabut naskah Pembina pendahulunya', () => {
    expect(mayRevokeSignature(PEMBINA, PEMBINA_2)).toBe(true);
  });

  it('tidak berlaku bagi jabatan yang jalan buntunya sudah tertutup', () => {
    expect(mayRevokeSignature(SEKRETARIS, KETUA)).toBe(false);
    expect(mayRevokeSignature(GURU, p('guru-2', RoleCode.SMPIT_GURU))).toBe(false);
  });
});

/**
 * Pengelola sistem mengurus kunci dan sertifikat, bukan kewenangan
 * menandatangani atas nama yayasan — pembagian yang sama dengan CA dan pemilik
 * sertifikat pada RFC 5280.
 */
describe('Super Admin', () => {
  it.each([PEMBINA, PENGAWAS, KETUA, KEPSEK, GURU])(
    'tidak dapat mencabut naskah siapa pun ($roleCode)',
    (signer) => {
      expect(mayRevokeSignature(signer, SUPER_ADMIN)).toBe(false);
    }
  );

  it('kecuali naskah yang ia tandatangani sendiri', () => {
    expect(mayRevokeSignature(SUPER_ADMIN, SUPER_ADMIN)).toBe(true);
  });
});

describe('kalimat penolakan', () => {
  it('menyebut kepada siapa pemohon harus mengajukan', () => {
    expect(whoMayRevoke(KEPSEK)).toMatch(/Pengawas Yayasan/);
    expect(whoMayRevoke(KETUA)).toMatch(/Pengawas Yayasan/);
  });

  it('menyebut Pembina untuk naskah Pembina', () => {
    expect(whoMayRevoke(PEMBINA)).toMatch(/Pembina Yayasan/);
  });

  it('menyebut penandatangannya sendiri untuk naskah Pengawas', () => {
    expect(whoMayRevoke(PENGAWAS)).toMatch(/penandatangannya sendiri/);
  });
});
