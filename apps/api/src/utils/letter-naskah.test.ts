import { describe, it, expect } from 'vitest';
import { LetterNature, LetterType } from '@prisma/client';
import {
  AGENDA_TYPE_CODE,
  LETTER_NATURE_LABELS,
  LETTER_TYPE_LABELS,
  assertNatureAllowed,
  isNatureAllowed,
  naturesFor,
  NaskahError,
} from './letter-naskah';

describe('jenis dan sifat naskah', () => {
  // The gap this closes: the model had no letter type at all, so an SK was
  // indistinguishable from an ordinary letter despite being numbered
  // differently and signed by a different office.
  it('korespondensi menerima keempat derajat kerahasiaan', () => {
    expect(naturesFor(LetterType.SURAT_DINAS)).toEqual([
      LetterNature.PUBLIC,
      LetterNature.LIMITED,
      LetterNature.CONFIDENTIAL,
      LetterNature.STRICTLY_CONFIDENTIAL,
    ]);
  });

  // "Terbatas" previously had nowhere to go, so a letter meant for a limited
  // readership was filed as Biasa and lost its restriction.
  it('Terbatas punya tempat tersendiri, bukan dipaksa menjadi Biasa', () => {
    expect(isNatureAllowed(LetterType.SURAT_DINAS, LetterNature.LIMITED)).toBe(true);
    expect(LETTER_NATURE_LABELS[LetterNature.LIMITED]).toBe('Terbatas');
  });

  it('surat keputusan tidak boleh rahasia — yang terkena keputusan harus bisa membacanya', () => {
    expect(() =>
      assertNatureAllowed(LetterType.SURAT_KEPUTUSAN, LetterNature.CONFIDENTIAL)
    ).toThrow(NaskahError);
    expect(() =>
      assertNatureAllowed(LetterType.SURAT_KEPUTUSAN, LetterNature.STRICTLY_CONFIDENTIAL)
    ).toThrow(NaskahError);

    // Terbatas tetap masuk akal, mis. SK yang memuat besaran gaji.
    expect(() =>
      assertNatureAllowed(LetterType.SURAT_KEPUTUSAN, LetterNature.LIMITED)
    ).not.toThrow();
  });

  it('surat tugas mengikuti aturan yang sama dengan surat keputusan', () => {
    expect(naturesFor(LetterType.SURAT_TUGAS)).toEqual([LetterNature.PUBLIC, LetterNature.LIMITED]);
  });

  it('naskah yang berlaku umum hanya boleh Biasa', () => {
    for (const type of [LetterType.SURAT_EDARAN, LetterType.PENGUMUMAN]) {
      expect(naturesFor(type)).toEqual([LetterNature.PUBLIC]);
      expect(() => assertNatureAllowed(type, LetterNature.LIMITED)).toThrow(NaskahError);
    }
  });

  // A refusal that does not say what is allowed just moves the confusion to
  // the clerk filling the form.
  it('penolakan menyebutkan pilihan yang tersedia', () => {
    expect(() =>
      assertNatureAllowed(LetterType.SURAT_KEPUTUSAN, LetterNature.CONFIDENTIAL)
    ).toThrow(/Biasa, Terbatas/);
  });

  it('setiap jenis punya sekurang-kurangnya satu sifat yang sah', () => {
    for (const type of Object.values(LetterType)) {
      expect(naturesFor(type).length, `${type} tidak punya sifat yang sah`).toBeGreaterThan(0);
    }
  });

  it('Biasa selalu sah, apa pun jenisnya', () => {
    // Otherwise a clerk could pick a type whose every nature is refused.
    for (const type of Object.values(LetterType)) {
      expect(isNatureAllowed(type, LetterNature.PUBLIC), type).toBe(true);
    }
  });

  it('setiap jenis punya label dan kode penomoran', () => {
    for (const type of Object.values(LetterType)) {
      expect(LETTER_TYPE_LABELS[type], type).toBeTruthy();
      expect(AGENDA_TYPE_CODE[type], type).toBeTruthy();
    }
  });

  // Each type keeps its own agenda book, exactly as on paper: SK number 1 and
  // surat dinas number 1 coexist. Sharing a counter would make SK numbers jump
  // whenever an ordinary letter went out.
  it('kode penomoran tiap jenis berbeda satu sama lain', () => {
    const codes = Object.values(AGENDA_TYPE_CODE);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Taken from a real Yayasan letter: 434/Sket/Y-CPS/VII/2026. The first
  // version emitted the enum name ("SURAT_KETERANGAN"), producing a number
  // shaped unlike anything the office actually issues.
  it('memakai singkatan surat, bukan nama enum', () => {
    expect(AGENDA_TYPE_CODE[LetterType.SURAT_KETERANGAN]).toBe('Sket');
    expect(AGENDA_TYPE_CODE[LetterType.SURAT_KEPUTUSAN]).toBe('SK');
    expect(AGENDA_TYPE_CODE[LetterType.SURAT_TUGAS]).toBe('ST');

    // No code should look like an enum constant.
    for (const code of Object.values(AGENDA_TYPE_CODE)) {
      expect(code, `${code} terlihat seperti nama enum`).not.toMatch(/_/);
      expect(code.length).toBeLessThanOrEqual(5);
    }
  });

  it('setiap sifat punya label', () => {
    for (const nature of Object.values(LetterNature)) {
      expect(LETTER_NATURE_LABELS[nature], nature).toBeTruthy();
    }
  });
});
