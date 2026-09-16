import { describe, it, expect } from 'vitest';
import { evaluateQuorum, requiredCount, type QuorumVoteInput } from './foundation-quorum';
import type { QuorumSnapshot } from '@cipansor/shared';

function snap(over: Partial<QuorumSnapshot> = {}): QuorumSnapshot {
  return {
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    activeCount: 5,
    presentMode: 'MUTLAK',
    presentValue: 1,
    decisionMode: 'MUTLAK',
    decisionValue: 1,
    decisionBasis: 'MUFTAKAT_FIRST',
    ...over,
  };
}

const votes = (cs: Array<QuorumVoteInput['choice']>): QuorumVoteInput[] =>
  cs.map((choice) => ({ choice }));

describe('requiredCount', () => {
  it('MUTLAK menuntut seluruh kolam', () => {
    expect(requiredCount('MUTLAK', 1, 5)).toBe(5);
  });
  it('MAJORITY 0.5 berarti > setengah', () => {
    expect(requiredCount('MAJORITY', 0.5, 5)).toBe(3);
    expect(requiredCount('MAJORITY', 0.5, 4)).toBe(3);
  });
  it('TWO_THIRDS dan THREE_QUARTERS membulatkan ke atas', () => {
    expect(requiredCount('TWO_THIRDS', 2 / 3, 5)).toBe(4);
    expect(requiredCount('THREE_QUARTERS', 3 / 4, 5)).toBe(4);
  });
});

describe('evaluateQuorum — CIRCULAR (mufakat 100% aktif)', () => {
  const circ = snap();
  it('terbuka selama belum semua memutus', () => {
    const e = evaluateQuorum(circ, votes(['APPROVE', 'APPROVE']));
    expect(e.presentMet).toBe(false);
    expect(e.outcome).toBe('OPEN');
  });
  it('lolos bila seluruh anggota aktif setuju', () => {
    const e = evaluateQuorum(circ, votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'APPROVE']));
    expect(e.outcome).toBe('APPROVED');
    expect(e.approvedCount).toBe(5);
  });
  it('dissent (REJECT) membuat sirkuler gugur walau sisanya setuju', () => {
    const e = evaluateQuorum(
      circ,
      votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'REJECT'])
    );
    expect(e.outcome).toBe('REJECTED');
  });
  it('ABSTAIN pada sirkuler juga mematikan mufakat', () => {
    const e = evaluateQuorum(
      circ,
      votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'ABSTAIN'])
    );
    expect(e.outcome).toBe('REJECTED');
  });
});

describe('evaluateQuorum — MEETING (hadir >½, sah mayoritas hadir)', () => {
  const meeting = snap({
    kind: 'MEETING',
    presentMode: 'MAJORITY',
    presentValue: 0.5,
    decisionMode: 'MAJORITY',
    decisionValue: 0.5,
  });
  it('belum kuorum hadir bila <½ memberi suara', () => {
    const e = evaluateQuorum(meeting, votes(['APPROVE', 'APPROVE'])); // 2 dari 5
    expect(e.presentMet).toBe(false);
    expect(e.outcome).toBe('OPEN');
  });
  it('sah bila hadir ≥½ dan mayoritas hadir setuju', () => {
    const e = evaluateQuorum(meeting, votes(['APPROVE', 'APPROVE', 'APPROVE', 'REJECT', 'ABSTAIN']));
    expect(e.presentMet).toBe(true);
    expect(e.decisionMet).toBe(true);
    expect(e.outcome).toBe('APPROVED');
  });
  it('tetap terbuka bila kuorum hadir tercapai tetapi setuju belum mayoritas dan masih ada anggota yang belum bersuara', () => {
    // 4 dari 5 hadir, baru 1 setuju. Kuorum hadir tercapai, tetapi anggota
    // kelima yang berhak masih bisa hadir & menyetujui — jadi belum boleh
    // ditolak. Inilah regresi tautologi `presentCount === decisionPool`.
    const e = evaluateQuorum(meeting, votes(['APPROVE', 'REJECT', 'REJECT', 'ABSTAIN']));
    expect(e.presentMet).toBe(true); // 4 dari 5 hadir
    expect(e.decisionMet).toBe(false);
    expect(e.outcome).toBe('OPEN');
  });
  it('ditolak hanya ketika SELURUH anggota aktif sudah bersuara dan setuju tak sampai mayoritas', () => {
    const e = evaluateQuorum(
      meeting,
      votes(['APPROVE', 'REJECT', 'REJECT', 'ABSTAIN', 'REJECT'])
    );
    expect(e.presentMet).toBe(true);
    expect(e.decisionMet).toBe(false);
    expect(e.outcome).toBe('REJECTED');
  });
});

describe('evaluateQuorum — MEETING dengan ambang hadir 2/3 & keputusan mayoritas', () => {
  const rule = snap({
    kind: 'MEETING',
    presentMode: 'TWO_THIRDS',
    presentValue: 2 / 3,
    decisionMode: 'MAJORITY',
    decisionValue: 0.5,
  });
  it('butuh ≥2/3 hadir, lalu mayoritas hadir setuju untuk APPROVED', () => {
    // 4 dari 5 hadir (approved 4) → present 4 >= ceil(5*2/3)=4; decision mayoritas(4)=3; 4>=3
    const e = evaluateQuorum(rule, votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE']));
    expect(e.presentMet).toBe(true);
    expect(e.decisionMet).toBe(true);
    expect(e.outcome).toBe('APPROVED');
  });
  it('2 dari 5 belum memenuhi kuorum hadir 2/3 → OPEN', () => {
    const e = evaluateQuorum(rule, votes(['APPROVE', 'APPROVE']));
    expect(e.presentRequired).toBe(4);
    expect(e.presentMet).toBe(false);
    expect(e.outcome).toBe('OPEN');
  });
});