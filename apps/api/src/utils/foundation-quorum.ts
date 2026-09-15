import type {
  FoundationQuorumMode,
  QuorumSnapshot,
} from '@cipansor/shared';

/**
 * Mesin kuorum keputusan organ yayasan — fungsi MURNI, tanpa Prisma.
 *
 * Dua ambang yang dihitung dari `QuorumSnapshot` dan daftar suara:
 *   - kuorum hadir  : berapa anggota organ harus hadir (memberi suara) agar
 *                     rapat/pemungutan layak.
 *   - kuorum sah    : berapa dari kolam keputusan harus menyetujui agar
 *                     keputusan terpenuhi.
 *
 * Kolam keputusan berbeda menurut cara pengambilan:
 *   - CIRCULAR : seluruh anggota AKTIF organ (keputusan sirkuler umumnya wajib
 *                mufakat 100%, jadi orang yang tak hadir sekalipun harus
 *                menyetujui atau keputusan gugur).
 *   - MEETING  : hanya yang HADIR (yang sudah memberi suara).
 *
 * Semantik mode ambang:
 *   - MUTLAK        : persis nilai × kolam (biasanya 1.0 → seluruh kolam).
 *   - MAJORITY      : lebih dari nilai × kolam (strictly greater).
 *   - TWO_THIRDS    : sekurang-kurangnya nilai × kolam (>= 2/3).
 *   - THREE_QUARTERS: sekurang-kurangnya nilai × kolam (>= 3/4).
 */

/** Satu suara dalam bentuk yang dimengerti mesin kuorum. */
export interface QuorumVoteInput {
  choice: 'APPROVE' | 'REJECT' | 'ABSTAIN';
}

export type QuorumOutcome = 'OPEN' | 'APPROVED' | 'REJECTED';

export interface QuorumEvaluation {
  activeCount: number;
  presentCount: number;
  approvedCount: number;
  rejectedCount: number;
  abstainCount: number;
  presentRequired: number;
  decisionRequired: number;
  presentMet: boolean;
  decisionMet: boolean;
  outcome: QuorumOutcome;
  /** Tambahan suara yang dibutuhkan untuk mencapai kuorum sah (>=0). */
  neededToApprove: number;
}

/** Jumlah yang dibutuhkan menurut mode dan nilai ambang. */
export function requiredCount(mode: FoundationQuorumMode, value: number, pool: number): number {
  if (pool <= 0) return 0;
  switch (mode) {
    case 'MUTLAK':
      return Math.ceil(pool * value);
    case 'MAJORITY':
      // > nilai×kolam. Untuk nilai 0.5 artinya "> setengah".
      return Math.floor(pool * value) + 1;
    case 'TWO_THIRDS':
      return Math.ceil(pool * value);
    case 'THREE_QUARTERS':
      return Math.ceil(pool * value);
    default:
      return Math.ceil(pool * value);
  }
}

/**
 * Evaluasi satu keputusan terhadap snapshot kuorum dan daftar suara terkini.
 */
export function evaluateQuorum(
  snapshot: QuorumSnapshot,
  votes: QuorumVoteInput[]
): QuorumEvaluation {
  const {
    activeCount,
    presentMode,
    presentValue,
    decisionMode,
    decisionValue,
  } = snapshot;

  const approvedCount = votes.filter((v) => v.choice === 'APPROVE').length;
  const rejectedCount = votes.filter((v) => v.choice === 'REJECT').length;
  const abstainCount = votes.filter((v) => v.choice === 'ABSTAIN').length;
  const presentCount = approvedCount + rejectedCount + abstainCount;

  const presentRequired = requiredCount(presentMode, presentValue, activeCount);
  const presentMet = presentCount >= presentRequired;

  // Kolam keputusan: seluruh aktif untuk sirkuler, yang hadir untuk rapat.
  const decisionPool = snapshot.kind === 'CIRCULAR' ? activeCount : presentCount;
  const decisionRequired = requiredCount(decisionMode, decisionValue, decisionPool);
  const decisionMet = presentMet && approvedCount >= decisionRequired;

  const neededToApprove = presentMet
    ? Math.max(0, decisionRequired - approvedCount)
    : Math.max(0, presentRequired - presentCount);

  let outcome: QuorumOutcome = 'OPEN';

  if (presentMet) {
    if (decisionMet) {
      outcome = 'APPROVED';
    } else {
      // Semua yang harus memutus sudah memberi suara dan tetap tak cukup →
      // keputusan tertolak. Pada CIRCULAR: seluruh anggota aktif sudah
      // bersuara (mufakat tak tercapai). Pada MEETING: semua yang hadir sudah
      // bersuara dan suara setuju tak sampai ambang.
      const decisionBodyFinished =
        snapshot.kind === 'CIRCULAR'
          ? presentCount >= activeCount
          : presentCount >= presentRequired && presentCount === decisionPool;
      if (decisionBodyFinished) {
        outcome = 'REJECTED';
      }
    }
  }

  return {
    activeCount,
    presentCount,
    approvedCount,
    rejectedCount,
    abstainCount,
    presentRequired,
    decisionRequired,
    presentMet,
    decisionMet,
    outcome,
    neededToApprove,
  };
}