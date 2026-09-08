import { describe, it, expect } from 'vitest';
import { LetterDirection, LetterStatus } from '@prisma/client';
import {
  assertMayArchive,
  assertMayDispatch,
  assertMayResubmit,
  assertMayReview,
  nextRung,
  statusAfterApproval,
  statusAfterResubmit,
  WorkflowError,
  type ReviewerRung,
} from './letter-workflow';

/** Tata usaha drafts, sekretaris parafs, ketua signs. */
function ladder(overrides: Partial<Record<string, string>> = {}): ReviewerRung[] {
  return [
    {
      id: 'r1',
      reviewerId: 'sekretaris',
      order: 1,
      status: overrides.sekretaris ?? 'PENDING',
      isSigner: false,
    },
    {
      id: 'r2',
      reviewerId: 'wakil',
      order: 2,
      status: overrides.wakil ?? 'PENDING',
      isSigner: false,
    },
    {
      id: 'r3',
      reviewerId: 'ketua',
      order: 3,
      status: overrides.ketua ?? 'PENDING',
      isSigner: true,
    },
  ];
}

describe('whose turn it is', () => {
  it('is the lowest order not yet approved', () => {
    expect(nextRung(ladder())?.reviewerId).toBe('sekretaris');
    expect(nextRung(ladder({ sekretaris: 'APPROVED' }))?.reviewerId).toBe('wakil');
  });

  it('is nobody once every rung has approved', () => {
    expect(
      nextRung(ladder({ sekretaris: 'APPROVED', wakil: 'APPROVED', ketua: 'APPROVED' }))
    ).toBeNull();
  });

  it('does not depend on the order rows arrive in', () => {
    const shuffled = [...ladder()].reverse();
    expect(nextRung(shuffled)?.reviewerId).toBe('sekretaris');
  });
});

describe('tiered verification', () => {
  // The gap this closes. processReview looked the caller up by
  // (letterId, reviewerId) and acted on whatever it found, so the signer could
  // sign a draft the sekretaris had never opened. `order` was decoration.
  it('refuses to let the signer sign ahead of the rungs below', () => {
    expect(() =>
      assertMayReview(LetterStatus.PENDING_REVIEW, ladder(), 'ketua')
    ).toThrow(WorkflowError);
  });

  it('names who is being waited for, rather than only refusing', () => {
    expect(() =>
      assertMayReview(LetterStatus.PENDING_REVIEW, ladder(), 'wakil')
    ).toThrow(/urutan 1/);
  });

  it('lets the rung whose turn it is act', () => {
    expect(
      assertMayReview(LetterStatus.PENDING_REVIEW, ladder(), 'sekretaris').reviewerId
    ).toBe('sekretaris');
    expect(
      assertMayReview(
        LetterStatus.PENDING_REVIEW,
        ladder({ sekretaris: 'APPROVED' }),
        'wakil'
      ).reviewerId
    ).toBe('wakil');
  });

  it('refuses someone who is not a reviewer at all', () => {
    expect(() =>
      assertMayReview(LetterStatus.PENDING_REVIEW, ladder(), 'kepala-sekolah')
    ).toThrow(/tidak terdaftar/);
  });

  it('refuses a second approval from the same person', () => {
    expect(() =>
      assertMayReview(
        LetterStatus.PENDING_REVIEW,
        ladder({ sekretaris: 'APPROVED' }),
        'sekretaris'
      )
    ).toThrow(/sudah menyetujui/);
  });

  // A signed letter is a finished document. Nothing about being listed as a
  // reviewer should let someone re-open one.
  it.each([
    LetterStatus.SIGNED,
    LetterStatus.SENT,
    LetterStatus.ARCHIVED,
    LetterStatus.DRAFT,
    LetterStatus.REVISION_NEEDED,
  ])('refuses to review a letter that is %s', (status) => {
    expect(() => assertMayReview(status, ladder(), 'sekretaris')).toThrow(
      WorkflowError
    );
  });
});

describe('where an approval leaves the letter', () => {
  it('waits for the next rung when one is below the signer', () => {
    expect(statusAfterApproval(ladder(), 'sekretaris')).toBe(
      LetterStatus.PENDING_REVIEW
    );
  });

  it('says READY_TO_SIGN once only the signer is left', () => {
    expect(statusAfterApproval(ladder({ sekretaris: 'APPROVED' }), 'wakil')).toBe(
      LetterStatus.READY_TO_SIGN
    );
  });

  it("signs the letter on the signer's approval", () => {
    expect(
      statusAfterApproval(
        ladder({ sekretaris: 'APPROVED', wakil: 'APPROVED' }),
        'ketua'
      )
    ).toBe(LetterStatus.SIGNED);
  });

  it('handles a single reviewer who is also the signer', () => {
    const solo: ReviewerRung[] = [
      { id: 'r1', reviewerId: 'ketua', order: 1, status: 'PENDING', isSigner: true },
    ];
    expect(statusAfterApproval(solo, 'ketua')).toBe(LetterStatus.SIGNED);
  });
});

describe('returning a draft and sending it back up', () => {
  it('only the author may resubmit, and only after a return', () => {
    expect(() =>
      assertMayResubmit(LetterStatus.REVISION_NEEDED, 'penulis', 'penulis')
    ).not.toThrow();

    // A reviewer who could resubmit could clear their own rejection.
    expect(() =>
      assertMayResubmit(LetterStatus.REVISION_NEEDED, 'penulis', 'sekretaris')
    ).toThrow(/pembuat surat/);

    expect(() =>
      assertMayResubmit(LetterStatus.PENDING_REVIEW, 'penulis', 'penulis')
    ).toThrow(/dikembalikan untuk revisi/);
  });

  // The reason approvals are cleared rather than kept below the rejector: a
  // paraf approves a specific text. Once the text changes, an approval given
  // before the change says nothing about the document now being sent.
  it('clears every approval, including those given before the rejection', () => {
    const afterRejection = ladder({ sekretaris: 'APPROVED', wakil: 'APPROVED' });
    expect(statusAfterResubmit(afterRejection)).toBe(LetterStatus.PENDING_REVIEW);

    // Confirm it is the sekretaris being waited for again, not the signer.
    const fresh = afterRejection.map((r) => ({ ...r, status: 'PENDING' }));
    expect(nextRung(fresh)?.reviewerId).toBe('sekretaris');
  });

  it('a lone signer goes straight back to READY_TO_SIGN', () => {
    const solo: ReviewerRung[] = [
      { id: 'r1', reviewerId: 'ketua', order: 1, status: 'APPROVED', isSigner: true },
    ];
    expect(statusAfterResubmit(solo)).toBe(LetterStatus.READY_TO_SIGN);
  });
});

/**
 * Pengiriman adalah langkah yang selama ini tidak ada, dan kata "SENT" dipakai
 * untuk hal yang berlawanan: surat *masuk* yang selesai diverifikasi.
 */
describe('pencatatan pengiriman', () => {
  it('mencatat pengiriman naskah keluar yang sudah ditandatangani', () => {
    expect(() =>
      assertMayDispatch(LetterDirection.OUTGOING, LetterStatus.SIGNED, false)
    ).not.toThrow();
  });

  // Surat yang sama diantar ke beberapa alamat, atau dikirim ulang karena yang
  // pertama tidak sampai. Buku ekspedisi menyimpan setiap percobaannya.
  it('mengizinkan pengiriman susulan atas surat yang sudah berstatus terkirim', () => {
    expect(() =>
      assertMayDispatch(LetterDirection.OUTGOING, LetterStatus.SENT, false)
    ).not.toThrow();
  });

  it('menolak surat masuk', () => {
    expect(() =>
      assertMayDispatch(LetterDirection.INCOMING, LetterStatus.DISPOSED, false)
    ).toThrow(/diterima, bukan dikirim/);
  });

  it.each([
    LetterStatus.DRAFT,
    LetterStatus.PENDING_REVIEW,
    LetterStatus.REVISION_NEEDED,
    LetterStatus.READY_TO_SIGN,
  ])('menolak naskah berstatus %s karena belum ditandatangani', (status) => {
    expect(() => assertMayDispatch(LetterDirection.OUTGOING, status, false)).toThrow(
      /belum ditandatangani/
    );
  });

  it('menolak surat yang sudah diarsipkan', () => {
    expect(() =>
      assertMayDispatch(LetterDirection.OUTGOING, LetterStatus.ARCHIVED, false)
    ).toThrow(/sudah diarsipkan/);
  });

  /**
   * Salinan yang telanjur beredar tetap dicetak — bercap DICABUT — tetapi
   * mengirimkan salinan baru dari naskah yang sudah ditarik adalah perbuatan
   * baru, dan yang ini ditolak.
   */
  it('menolak naskah yang tanda tangannya sudah dicabut', () => {
    expect(() =>
      assertMayDispatch(LetterDirection.OUTGOING, LetterStatus.SIGNED, true)
    ).toThrow(/sudah dicabut/);
  });
});

describe('archiving', () => {
  it('closes a letter that has been through its flow', () => {
    expect(() => assertMayArchive(LetterStatus.DISPOSED)).not.toThrow();
    expect(() => assertMayArchive(LetterStatus.SENT)).not.toThrow();
  });

  it('refuses to archive twice', () => {
    expect(() => assertMayArchive(LetterStatus.ARCHIVED)).toThrow(/sudah diarsipkan/);
  });

  it('refuses to archive an unfinished draft', () => {
    expect(() => assertMayArchive(LetterStatus.DRAFT)).toThrow(/Konsep/);
  });
});
