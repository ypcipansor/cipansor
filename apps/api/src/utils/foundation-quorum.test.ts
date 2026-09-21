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

  /**
   * Regresi item review #7 — MODE yang mengikat, bukan nilai numeriknya.
   *
   * Versi sebelumnya mengevaluasi `value` secara literal, sehingga baris
   * ber-mode TWO_THIRDS dengan value 0.5 menuntut "≥ setengah" sambil menamakan
   * dirinya "dua pertiga". Sekarang `requiredCount` menurunkan ambang dari
   * mode; `value` yang menyimpang tidak lagi menyetir hasil.
   */
  it('mengabaikan value yang bertentangan dengan mode', () => {
    // 10 anggota: TWO_THIRDS menuntut 7, bukan 6 (yang akan dihasilkan 0.5).
    expect(requiredCount('TWO_THIRDS', 0.5, 10)).toBe(7);
    expect(requiredCount('MUTLAK', 0.5, 10)).toBe(10);
    expect(requiredCount('THREE_QUARTERS', 0.5, 10)).toBe(8);
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
    const e = evaluateQuorum(circ, votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'REJECT']));
    expect(e.outcome).toBe('REJECTED');
  });
  it('ABSTAIN pada sirkuler juga mematikan mufakat', () => {
    const e = evaluateQuorum(circ, votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'ABSTAIN']));
    expect(e.outcome).toBe('REJECTED');
  });

  /**
   * Regresi: satu REJECT menutup sirkuler lebih awal, tanpa menunggu seluruh
   * anggota bersuara.
   *
   * Versi sebelumnya hanya menutup bila `presentCount >= activeCount`, sehingga
   * seorang penolak di antara anggota yang selebihnya diam meninggalkan
   * keputusan berstatus VOTING selamanya. Mufakat sudah mustahil saat itu juga;
   * menunggu suara yang tak akan datang berarti keputusan tak pernah dapat
   * difinalkan.
   */
  it('menutup sirkuler sebagai REJECTED begitu mufakat mustahil, walau baru sebagian bersuara', () => {
    // 5 anggota aktif, baru 2 memberi suara: 1 setuju, 1 menolak.
    // Maksimum setuju yang mungkin = 1 + 3 (yang belum bersuara) = 4 < 5.
    const e = evaluateQuorum(circ, votes(['APPROVE', 'REJECT']));
    expect(e.presentCount).toBe(2);
    expect(e.presentMet).toBe(false); // kuorum hadir belum tercapai
    expect(e.outcome).toBe('REJECTED'); // tetapi mufakat sudah mustahil
  });

  it('ABSTAIN dini juga menutup sirkuler sebagai REJECTED', () => {
    const e = evaluateQuorum(circ, votes(['APPROVE', 'ABSTAIN']));
    expect(e.outcome).toBe('REJECTED');
  });

  it('tidak menutup sirkuler selama mufakat MASIH mungkin', () => {
    // 3 setuju dari 5, 2 belum bersuara → maksimum 5 ≥ 5, masih mungkin.
    const e = evaluateQuorum(circ, votes(['APPROVE', 'APPROVE', 'APPROVE']));
    expect(e.outcome).toBe('OPEN');
  });

  /**
   * Regresi: ambang 0 tak boleh mengesahkan keputusan tanpa satu suara pun.
   *
   * `requiredCount(mode, 0, pool)` menghasilkan 0, sehingga `approvedCount (0)
   * >= decisionRequired (0)` dan `evaluateQuorum` mengembalikan APPROVED
   * sebelum ada yang menyetujui — lalu finalize menyegelnya. Sirkuler dengan
   * ambang nol dan tanpa suara adalah bentuk paling telanjang dari ini.
   */
  it('tidak pernah APPROVED dengan approvedCount === 0', () => {
    const zeroRule = snap({ decisionValue: 0, presentValue: 0 });
    const e = evaluateQuorum(zeroRule, []);
    expect(e.approvedCount).toBe(0);
    expect(e.outcome).not.toBe('APPROVED');
  });

  it('tidak pernah APPROVED dengan approvedCount === 0 pada rapat', () => {
    const zeroMeeting = snap({
      kind: 'MEETING',
      presentMode: 'MUTLAK',
      presentValue: 0,
      decisionMode: 'MUTLAK',
      decisionValue: 0,
    });
    const e = evaluateQuorum(zeroMeeting, []);
    expect(e.outcome).not.toBe('APPROVED');
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

  /**
   * Regresi BUG SEVERE — hasil rapat bergantung pada urutan suara.
   *
   * Versi lama mengevaluasi ambang terhadap `presentCount` saat itu dan
   * mengembalikan APPROVED begitu peserta yang SEDANG hadir menyetujui. Dua
   * orang yang membuka rapat lalu setuju langsung mengesahkannya; anggota
   * ketiga yang datang kemudian ditolak karena statusnya sudah bukan VOTING.
   * Urutan suara mengubah hasil akhir — pelanggaran invarian paling dasar.
   *
   * Sekarang rapat yang BELUM ditutup tidak pernah punya hasil akhir: apa pun
   * suaranya, selama `closed` belum true, outcome adalah OPEN.
   */
  it('TIDAK pernah APPROVED sebelum rapat ditutup, walau kuorum hadir & setuju tercapai', () => {
    const e = evaluateQuorum(
      meeting,
      votes(['APPROVE', 'APPROVE', 'APPROVE', 'REJECT', 'ABSTAIN'])
    );
    expect(e.presentMet).toBe(true);
    expect(e.decisionMet).toBe(true);
    expect(e.outcome).toBe('OPEN');
  });

  it('APPROVED hanya setelah ditutup (closed: true)', () => {
    const e = evaluateQuorum(
      meeting,
      votes(['APPROVE', 'APPROVE', 'APPROVE', 'REJECT', 'ABSTAIN']),
      { closed: true }
    );
    expect(e.outcome).toBe('APPROVED');
  });

  it('tetap terbuka bila kuorum hadir tercapai tetapi setuju belum mayoritas dan masih ada anggota yang belum bersuara', () => {
    // 4 dari 5 hadir, baru 1 setuju. Anggota kelima yang berhak masih bisa
    // hadir & menyetujui — jadi belum boleh ditolak.
    const e = evaluateQuorum(meeting, votes(['APPROVE', 'REJECT', 'REJECT', 'ABSTAIN']));
    expect(e.presentMet).toBe(true); // 4 dari 5 hadir
    expect(e.decisionMet).toBe(false);
    expect(e.outcome).toBe('OPEN');
  });

  /**
   * Regresi BUG SEVERE — rapat yang DITOLAK menggantung selamanya.
   *
   * Rapat yang kuorum tetapi gagal mencapai approval tidak boleh menunggu
   * seluruh anggota aktif memilih agar dapat ditutup sebagai REJECTED: anggota
   * yang absen akan membuat keputusan tak pernah selesai. Penutupan manual
   * (`closed: true`) menyelesaikannya — pemimpin rapat menutup dengan hasil apa
   * pun yang sudah sah, tanpa menunggu yang absen.
   */
  it('DITUTUP sebagai REJECTED tanpa menunggu seluruh anggota aktif bersuara', () => {
    const e = evaluateQuorum(meeting, votes(['APPROVE', 'REJECT', 'REJECT', 'ABSTAIN']), {
      closed: true,
    });
    expect(e.presentMet).toBe(true);
    expect(e.decisionMet).toBe(false);
    expect(e.outcome).toBe('REJECTED');
  });

  it('rapat yang BELUM memenuhi kuorum hadir tidak dapat ditutup sebagai hasil apa pun', () => {
    // 1 dari 5 hadir, ditutup paksa → bukan APPROVED/REJECTED, tetap OPEN
    // sehingga `finalize` menolaknya.
    const e = evaluateQuorum(meeting, votes(['APPROVE']), { closed: true });
    expect(e.presentMet).toBe(false);
    expect(e.outcome).toBe('OPEN');
  });

  /**
   * Invarian urutan: permutasi himpunan suara yang SAMA menghasilkan outcome
   * akhir yang sama, baik saat masih terbuka maupun setelah ditutup.
   */
  it('outcome tidak bergantung pada urutan suara (property)', () => {
    const combo: Array<QuorumVoteInput['choice']> = ['APPROVE', 'REJECT', 'APPROVE', 'ABSTAIN'];
    const perms: Array<Array<QuorumVoteInput['choice']>> = [];
    const permute = (rest: typeof combo, cur: typeof combo) => {
      if (rest.length === 0) {
        perms.push([...cur]);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...cur, rest[i]]);
      }
    };
    permute(combo, []);

    const open = new Set(perms.map((p) => evaluateQuorum(meeting, votes(p)).outcome));
    const closed = new Set(
      perms.map((p) => evaluateQuorum(meeting, votes(p), { closed: true }).outcome)
    );
    expect(open.size).toBe(1);
    expect(closed.size).toBe(1);
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
    const e = evaluateQuorum(rule, votes(['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE']), {
      closed: true,
    });
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
