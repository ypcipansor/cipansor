import type { FoundationQuorumMode, QuorumSnapshot } from '@cipansor/shared';
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
 * Apakah pemungutan sudah DITUTUP?
 *
 * **Sirkuler** tidak punya "rapat" yang harus ditutup: kolam keputusannya
 * adalah SELURUH anggota aktif dan tidak bertambah, sehingga hasilnya sudah
 * dapat disimpulkan kapan saja (dan keputusan gugur segera setelah mufakat
 * mustahil). `closed` tidak mengubah apa pun untuknya.
 *
 * **Rapat** sebaliknya. Selama rapat masih berlangsung, siapa pun yang belum
 * bersuara masih dapat hadir dan mengubah hasil — jadi TIDAK ADA hasil akhir
 * yang sah sebelum rapat ditutup. Tanpa `closed`, keputusan akan menutup diri
 * di tengah rapat begitu peserta yang sedang hadir menyetujui, sehingga hasil
 * akhir bergantung pada URUTAN suara. Penutupan manual (`closed: true`)
 * menghitung hasil sekali terhadap himpunan suara yang sudah tetap.
 */
export interface QuorumOptions {
  /** Rapat/pemungutan sudah dinyatakan selesai oleh pemimpinnya. */
  closed?: boolean;
}

/**
 * Jumlah yang dibutuhkan menurut mode kuorum.
 *
 * **Mode yang menentukan ambang, bukan `value`.** Nilai pecahan yang tersimpan
 * di baris aturan diabaikan — `quorumValueForMode` yang menetapkannya, karena
 * label mode adalah janji yang dibaca orang ("dua pertiga" berarti 2/3).
 * Mengevaluasi `value` secara literal akan membuat baris ber-mode TWO_THIRDS
 * dengan value 0.5 menuntut "≥ setengah" sambil menamakan dirinya "dua
 * pertiga": ambang yang berlaku tidak dapat diketahui dari labelnya. Skema
 * penyimpanan (upsertFoundationRuleSchema) menolak nilai yang menyimpang.
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
 *
 * `opts.closed` menyatakan rapat/pemungutan sudah ditutup. Hanya dengan itu
 * sebuah RAPAT dapat memperoleh hasil akhir; sirkuler tidak membutuhkannya
 * (lihat `QuorumOptions`). Ini yang membuat hasil akhir INVARIANT terhadap
 * urutan suara: himpunan suara yang sama menghasilkan outcome yang sama, tak
 * peduli siapa yang menekan tombol lebih dulu.
 */
export function evaluateQuorum(
  snapshot: QuorumSnapshot,
  votes: QuorumVoteInput[],
  opts: QuorumOptions = {}
): QuorumEvaluation {
  const { activeCount, presentMode, presentValue, decisionMode, decisionValue } = snapshot;

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
    snapshot.kind === 'CIRCULAR' && approvedCount + (activeCount - presentCount) < decisionRequired;

  let outcome: QuorumOutcome = 'OPEN';

  if (decisionImpossible) {
    outcome = 'REJECTED';
  } else if (presentMet) {
    if (snapshot.kind === 'CIRCULAR') {
      /**
       * Sirkuler: kolamnya tetap (seluruh anggota aktif), jadi ambangnya sah
       * begitu terpenuhi. APPROVED menuntut minimal satu suara setuju — ambang
       * nol pada aturan lama tidak boleh mengesahkan keputusan tanpa suara.
       */
      if (decisionMet && approvedCount > 0) outcome = 'APPROVED';
    } else if (opts.closed) {
      /**
       * Rapat yang SUDAH DITUTUP: hasil dihitung sekali terhadap himpunan
       * suara yang tetap. Di sinilah satu-satunya tempat sebuah rapat boleh
       * berakhir APPROVED/REJECTED — sebelum ditutup, outcome tetap OPEN dan
       * anggota yang belum bersuara tetap dapat mengubahnya. Karena itu urutan
       * suara tidak dapat mengubah hasil akhir.
       *
       * Bila approval tidak tercapai padahal kuorum hadir terpenuhi, rapat
       * ditutup sebagai REJECTED. Anggota yang absen TIDAK dapat membuat
       * keputusan menggantung: penutupan manual adalah wewenang pemimpin rapat,
       * bukan menunggu seluruh anggota aktif bersuara.
       */
      outcome = decisionMet && approvedCount > 0 ? 'APPROVED' : 'REJECTED';
    }
    // Rapat yang belum ditutup tetap OPEN.
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
