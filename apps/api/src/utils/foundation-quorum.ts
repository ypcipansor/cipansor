import type {
  FoundationQuorumMode,
  QuorumSnapshot,
} from '@cipansor/shared';
import { quorumValueForMode } from '@cipansor/shared';

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
 *                menyetujui atau keputusan gugur). Karena kolamnya tetap,
 *                keputusan gugur SEGERA begitu mufakat menjadi mustahil
 *                (ada REJECT/ABSTAIN), tanpa menunggu sisa anggota bersuara.
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

/**
 * Jumlah yang dibutuhkan menurut mode kuorum.
 *
 * **Mode yang menentukan ambang, bukan `value`.** Nilai pecahan yang tersimpan
 * di baris aturan diabaikan — `quorumValueForMode` yang menetapkannya, karena
 * label mode adalah janji yang dibaca orang ("dua pertiga" berarti 2/3).
 * Versi sebelumnya mengevaluasi `value` secara literal, sehingga baris aturan
 * ber-mode TWO_THIRDS dengan value 0.5 menuntut "≥ setengah" sambil menamakan
 * dirinya "dua pertiga": ambang yang benar-benar berlaku tidak dapat diketahui
 * dari labelnya, dan aturannya bertentangan dengan dirinya sendiri. Skema
 * penyimpanan (upsertFoundationRuleSchema) menolak nilai yang menyimpang,
 * sehingga baris lama pun tetap terbaca konsisten di sini.
 *
 * `value` tetap diterima sebagai argumen agar pemanggil tidak perlu berubah;
 * ia hanya dipakai sebagai cadangan bila mode tidak dikenal (baris sangat lama).
 */
export function requiredCount(mode: FoundationQuorumMode, value: number, pool: number): number {
  if (pool <= 0) return 0;
  const fraction = quorumValueForMode(mode) ?? value;
  switch (mode) {
    case 'MUTLAK':
      return Math.ceil(pool * fraction);
    case 'MAJORITY':
      // > nilai×kolam. Untuk nilai 0.5 artinya "> setengah".
      return Math.floor(pool * fraction) + 1;
    case 'TWO_THIRDS':
      return Math.ceil(pool * fraction);
    case 'THREE_QUARTERS':
      return Math.ceil(pool * fraction);
    default:
      return Math.ceil(pool * fraction);
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

  /**
   * Sirkuler: keputusan gugur begitu mustahil tercapai, tanpa menunggu seluruh
   * anggota bersuara.
   *
   * Pada sirkuler kolam keputusannya adalah SELURUH anggota aktif dan tidak
   * bertambah lagi, jadi satu REJECT (atau ABSTAIN) sudah menutup pintu
   * mufakat. Versi sebelumnya hanya menutup keputusan bila
   * `presentCount >= activeCount`, sehingga satu penolakan di antara anggota
   * yang selebihnya diam meninggalkan keputusan berstatus VOTING selamanya —
   * pemungutan yang jelas-jelas sudah gugur tak pernah ditutup, dan pemanggil
   * yang menunggu finalisasi menunggu tanpa akhir.
   *
   * Anggota yang belum bersuara diperlakukan sebagai suara yang MASIH MUNGKIN
   * menyetujui: keputusan baru gugur bila jumlah maksimum penyetujuan yang
   * mungkin (setuju sekarang + yang belum bersuara) masih kurang dari ambang.
   * Untuk rapat, kolamnya bertambah setiap kali seseorang hadir, sehingga
   * "mustahil" tidak dapat disimpulkan dari angka hari ini.
   */
  const decisionImpossible =
    snapshot.kind === 'CIRCULAR' &&
    approvedCount + (activeCount - presentCount) < decisionRequired;

  let outcome: QuorumOutcome = 'OPEN';

  if (decisionImpossible) {
    outcome = 'REJECTED';
  } else if (presentMet) {
    if (decisionMet && approvedCount > 0) {
      outcome = 'APPROVED';
    } else {
      // Semua yang harus memutus sudah memberi suara dan tetap tak cukup →
      // keputusan tertolak. Pada CIRCULAR: seluruh anggota aktif sudah
      // bersuara (mufakat tak tercapai). Pada MEETING: seluruh anggota aktif
      // sudah bersuara — bukan sekadar kuorum hadir tercapai.
      //
      // Untuk MEETING, `presentCount === decisionPool` adalah tautologi
      // (`decisionPool` = presentCount), sehingga REJECTED keluar begitu kuorum
      // hadir terpenuhi tanpa cukup setuju — padahal anggota lain yang berhak
      // masih bisa hadir dan menyetujui. Sama seperti CIRCULAR, penolakan hanya
      // sah ketika tidak ada lagi suara yang mungkin masuk.
      const decisionBodyFinished = presentCount >= activeCount;
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