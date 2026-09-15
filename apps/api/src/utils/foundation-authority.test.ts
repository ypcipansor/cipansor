import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  isMemberOfOrgan,
  organForDecisionType,
  organMayDecide,
  roleCodesForOrgan,
} from './foundation-authority';

describe('organForDecisionType', () => {
  it('perubahan AD & pengangkatan pengurus = kewenangan Pembina', () => {
    expect(organForDecisionType('perubahan-anggaran-dasar')).toEqual(['PEMBINA']);
    expect(organForDecisionType('pengangkatan-pengurus')).toEqual(['PEMBINA']);
  });
  it('keputusan operasional = Pengurus', () => {
    expect(organForDecisionType('keputusan-operasional')).toEqual(['PENGURUS']);
  });
  it('pemberhentian sementara pengurus = Pengawas (ps. 41)', () => {
    expect(organForDecisionType('pemberhentian-sementara-pengurus')).toEqual(['PENGAWAS']);
  });
  it('pemilihan pembina = GABUNGAN (ps. 28)', () => {
    expect(organForDecisionType('pemilihan-pembina')).toEqual(['GABUNGAN']);
  });
  it('jenis tak dikenal jatuh ke Pembina (organ puncak)', () => {
    expect(organForDecisionType('apa-pun')).toEqual(['PEMBINA']);
  });
});

describe('organMayDecide', () => {
  it('Pengurus tidak boleh memutus hal kewenangan Pembina', () => {
    expect(organMayDecide('PENGURUS', 'perubahan-anggaran-dasar', RoleCode.YAYASAN_ANGGOTA)).toBe(false);
  });
  it('Pembina boleh memutus kewenangannya sendiri', () => {
    expect(organMayDecide('PEMBINA', 'perubahan-anggaran-dasar', RoleCode.YAYASAN_PEMBINA)).toBe(true);
  });
  it('SUPER_ADMIN diizinkan membuat draf bila allowSuperAdmin', () => {
    expect(organMayDecide('PENGURUS', 'keputusan-operasional', RoleCode.SUPER_ADMIN, { allowSuperAdmin: true })).toBe(true);
  });
  it('SUPER_ADMIN TIDAK otomatis boleh memberi suara (allowSuperAdmin default false)', () => {
    expect(organMayDecide('PEMBINA', 'perubahan-anggaran-dasar', RoleCode.SUPER_ADMIN)).toBe(false);
  });
});

describe('keanggotaan organ', () => {
  it('PEMBINA hanya YAYASAN_PEMBINA', () => {
    expect(roleCodesForOrgan('PEMBINA')).toEqual([RoleCode.YAYASAN_PEMBINA]);
  });
  it('PENGURUS mencakup ketua/sekretaris/bendahara/anggota', () => {
    expect(roleCodesForOrgan('PENGURUS')).toContain(RoleCode.YAYASAN_KETUA);
    expect(roleCodesForOrgan('PENGURUS')).toContain(RoleCode.YAYASAN_ANGGOTA);
  });
  it('PENGAWAS hanya YAYASAN_PENGAWAS', () => {
    expect(roleCodesForOrgan('PENGAWAS')).toEqual([RoleCode.YAYASAN_PENGAWAS]);
  });
  it('isMemberOfOrgan', () => {
    expect(isMemberOfOrgan('PENGURUS', RoleCode.YAYASAN_SEKRETARIS)).toBe(true);
    expect(isMemberOfOrgan('PENGURUS', RoleCode.YAYASAN_PEMBINA)).toBe(false);
    expect(isMemberOfOrgan('PEMBINA', RoleCode.YAYASAN_PEMBINA)).toBe(true);
  });
});