import { describe, it, expect } from 'vitest';
import { BloodType, EducationLevel, IncomeRange, OccupationType, TransportMode } from '@prisma/client';
import {
  BLOOD_TYPE_VALUES,
  EDUCATION_LEVEL_VALUES,
  INCOME_RANGE_VALUES,
  OCCUPATION_VALUES,
  TRANSPORT_MODE_VALUES,
  bulkUpdateStudentComplianceSchema,
  updateStudentComplianceSchema,
} from '@cipansor/shared';

/**
 * Kontrak PUT /student-compliance/:studentId.
 *
 * Diukur di rig 2026-09-14 pada main: formulir Kelengkapan Data mengirim
 * `fatherNIK`, `isKIP`, `distance`, `pkhNumber`, `hasDisability` dan
 * `transportMode: "MOTOR"` — tidak satu pun nama/nilai kolom — sehingga SETIAP
 * simpan dijawab 500. Dan karena controller meneruskan body mentah ke
 * `prisma.student.update`, kolom lain (`religion`, `unitId`, `deletedAt`) bisa
 * ditulis siapa pun yang boleh membuka halaman itu.
 */
describe('skema kelengkapan data santri', () => {
  const parse = (body: unknown) => updateStudentComplianceSchema.safeParse(body);
  const kunciDitolak = (body: unknown) => {
    const r = parse(body);
    expect(r.success).toBe(false);
    return r.success ? [] : r.error.issues.flatMap((i) => ('keys' in i ? (i.keys as string[]) : []));
  };

  describe('menutup penugasan massal', () => {
    it.each(['religion', 'unitId', 'userId', 'deletedAt', 'status', 'nis'])(
      'kolom "%s" tidak bisa ditulis lewat endpoint ini',
      (kolom) => {
        expect(kunciDitolak({ [kolom]: 'x' })).toContain(kolom);
      }
    );

    it('payload formulir LAMA ditolak dengan menyebut nama isiannya, bukan 500', () => {
      const lama = {
        nisn: '0012345678',
        isKIP: false,
        isPKH: false,
        pkhNumber: '',
        kksNumber: '',
        hasDisability: false,
        disabilityType: '',
        fatherNIK: '',
        distance: 3,
      };
      expect(kunciDitolak(lama)).toEqual(
        expect.arrayContaining(['isKIP', 'isPKH', 'pkhNumber', 'kksNumber', 'hasDisability', 'fatherNIK', 'distance'])
      );
    });

    it('bentuk baris massal lama { studentId, data } ditolak', () => {
      const r = bulkUpdateStudentComplianceSchema.safeParse({
        updates: [{ studentId: '6f1c3a52-2c57-4a43-9d52-0b3f0e8d5a11', data: { rt: '001' } }],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('NISN dan NIK', () => {
    it.each([
      ['12345678', 'NISN harus 10 digit angka'],
      ['0134SDB1', 'NISN harus 10 digit angka'], // bentuk yang dulu ditanam seed.ts
      ['00123456789', 'NISN harus 10 digit angka'],
    ])('NISN "%s" ditolak: %s', (nisn, pesan) => {
      const r = parse({ nisn });
      expect(r.success).toBe(false);
      expect(r.success ? '' : r.error.issues[0].message).toBe(pesan);
    });

    it('NIK 15 digit ditolak; NIK ayah/ibu/wali juga diperiksa', () => {
      for (const kolom of ['nik', 'fatherNik', 'motherNik', 'guardianNik', 'noKK']) {
        const r = parse({ [kolom]: '320607120412000' });
        expect(r.success, kolom).toBe(false);
      }
    });

    it('string kosong berarti "kosongkan" dan tersimpan sebagai null; spasi tepi dibuang', () => {
      const r = parse({ nisn: '', nik: '  ', noKK: ' 3206071204120001 ' });
      expect(r.success).toBe(true);
      expect(r.success && r.data).toMatchObject({ nisn: null, nik: null, noKK: '3206071204120001' });
    });

    it('alamat (kolom NOT NULL) boleh tidak dikirim, tapi tidak boleh dikosongkan', () => {
      expect(parse({}).success).toBe(true);
      expect(parse({ address: '' }).success).toBe(false);
    });
  });

  it('payload formulir BARU lolos dan tanggalnya menjadi Date', () => {
    const r = parse({
      nisn: '0012345678',
      nik: '3206071204120001',
      address: 'Jl. Santri No. 1, Sukabumi',
      transportMode: 'SEPEDA_MOTOR',
      distanceToSchool: 2.5,
      travelTime: 15,
      kipNumber: '',
      isPkh: true,
      isKks: false,
      bloodType: 'TIDAK_TAHU',
      height: 131.5,
      specialNeeds: '',
      fatherNik: '',
      fatherBirthDate: '1980-02-01',
      fatherEducation: 'LAINNYA',
      fatherOccupation: 'PETANI',
      fatherIncome: 'RANGE_1JT_2JT',
      motherBirthDate: '',
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.fatherBirthDate).toBeInstanceOf(Date);
    expect(r.success && r.data.motherBirthDate).toBeNull();
  });

  it('nilai pilihan di luar enum ditolak ("MOTOR" dari formulir lama)', () => {
    expect(parse({ transportMode: 'MOTOR' }).success).toBe(false);
  });
});

/**
 * Pilihan ditulis di packages/shared (dipakai formulir web) dan enum di
 * schema.prisma (dipakai kolom). Tidak ada tipe yang menghubungkan keduanya —
 * persis celah yang melahirkan "MOTOR". Uji ini yang menghubungkannya.
 */
describe('pilihan formulir sama dengan enum Prisma', () => {
  it.each([
    ['TransportMode', TRANSPORT_MODE_VALUES, TransportMode],
    ['BloodType', BLOOD_TYPE_VALUES, BloodType],
    ['EducationLevel', EDUCATION_LEVEL_VALUES, EducationLevel],
    ['OccupationType', OCCUPATION_VALUES, OccupationType],
    ['IncomeRange', INCOME_RANGE_VALUES, IncomeRange],
  ] as const)('%s', (_nama, pilihan, enumPrisma) => {
    expect([...pilihan].sort()).toEqual(Object.values(enumPrisma).sort());
  });
});
