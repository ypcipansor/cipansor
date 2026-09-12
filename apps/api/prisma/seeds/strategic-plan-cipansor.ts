/**
 * Strategic-planning demo data — the yayasan's RPJP → Renstra → RKA cascade,
 * at full fidelity to the Indonesian planning formalism (Inmendagri No. 1/2024
 * for RPJP; SAKIP cascade for Renstra; RKA-K/L shape for RKA).
 *
 * Modelled on three mock-up planning documents for Yayasan Pesantren Cipansor.
 * Realistic mock-ups, NOT official documents. The three levels form one cascade:
 *
 *   RPJP 2027–2045  (foundation-wide)  — Visi → Sasaran Visi → IUP per Tahap I–IV
 *     └─ Renstra 2027–2029 (Tahap I)   — Visi/Misi → SS → Program (IKP) → Kegiatan (IKK/tahun)
 *          └─ RKA 2027 (year 1)        — Kegiatan → IKK triwulanan + jadwal bulanan + RAB + sumber dana
 *
 * Full-fidelity structures now seeded (beyond the earlier skeleton):
 *   - plan.vision / plan.mission
 *   - PlanIndicator.targets[]  — staged targets (Tahap I–IV / per tahun / triwulan)
 *   - Kamus Indikator fields    — definition/formula/dataSource/frequency/picRole
 *   - PlanActivity.kind + code + parent/children (Program → Kegiatan depth)
 *   - PlanActivity.indicators   — IKP (Program) / IKK (Kegiatan)
 *   - PlanActivity.scheduleMonths — the ● jadwal bulanan matrix
 *   - PlanActivityBudgetItem[]  — RAB rinci (uraian × volume × harga)
 *   - PlanFundingSource[]       — proyeksi pendapatan per sumber dana
 *
 * Nominal budgets are INDICATIVE mock-up figures (the source doc left every RAB
 * cell as "[Rp ...]"); each RKA activity notes this.
 */
import {
  PrismaClient,
  Prisma,
  PlanType,
  PlanStatus,
  PlanPriority,
  PlanActivityKind,
  PlanIndicatorLevel,
  BSCPerspective,
} from '@prisma/client';

export interface StrategicPlanSeedUsers {
  createdById: string;
  approvedById: string;
  ketua: string;
  sekretaris: string;
  bendahara: string;
  kepalaSd: string;
  kepalaSmp: string;
  kepalaSma: string;
  koordinator: string;
  unitSmpId: string;
}

const D = (rupiah: number) => new Prisma.Decimal(rupiah);
const JT = 1_000_000;
const IND = ' (nominal indikatif — mock-up demo; RAB resmi diisi Bendahara)';
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type StageTarget = { period: string; targetValue: number; actualValue?: number };
type IndicatorSeed = {
  name: string;
  unit: string;
  baseline?: number;
  targetValue: number;
  currentValue?: number;
  level?: PlanIndicatorLevel;
  definition?: string;
  formula?: string;
  dataSource?: string;
  frequency?: string;
  picRole?: string;
  targets?: StageTarget[];
};

/** Build a nested-create indicator payload (objective- or activity-scoped). */
function indicator(i: IndicatorSeed): Prisma.PlanIndicatorCreateWithoutObjectiveInput {
  return {
    name: i.name,
    unit: i.unit,
    baseline: i.baseline,
    targetValue: i.targetValue,
    currentValue: i.currentValue ?? i.baseline ?? 0,
    level: i.level,
    definition: i.definition,
    formula: i.formula,
    dataSource: i.dataSource,
    frequency: i.frequency,
    picRole: i.picRole,
    targets: i.targets
      ? { create: i.targets.map((t, idx) => ({ period: t.period, order: idx, targetValue: t.targetValue, actualValue: t.actualValue })) }
      : undefined,
  };
}

export async function seedStrategicPlans(prisma: PrismaClient, u: StrategicPlanSeedUsers) {
  // ───────────────────────────────────────────────────────────────────────
  // 1. RPJP 2027–2045 — Visi → Sasaran Visi → IUP (progresi per Tahap I–IV).
  //    No Program/Kegiatan (faithful: an RPJP stops at Sasaran Pokok/IUP).
  // ───────────────────────────────────────────────────────────────────────
  const rpjp = await prisma.strategicPlan.create({
    data: {
      type: PlanType.RPJP,
      status: PlanStatus.APPROVED,
      title: 'RPJP Yayasan Pesantren Cipansor 2027–2045',
      description:
        'Rencana Pembangunan Jangka Panjang: dokumen induk perencanaan Yayasan. ' +
        'Kerangka resmi RPJP/RPJPD (Inmendagri No. 1/2024): Visi → Sasaran Visi → ' +
        'Misi Pembangunan → Arah Pembangunan → Sasaran Pokok & IUP per Tahap. ' +
        'Diselaraskan dengan RPJPN 2025–2045, RPJPD Jawa Barat & Kab. Tasikmalaya. ' +
        'Mock-up demo, bukan dokumen resmi.',
      vision:
        "Menjadi lembaga pendidikan pesantren terpadu yang unggul, berdaya saing di " +
        "tingkat regional Jawa Barat, dan menjadi rujukan pembinaan generasi Qur'ani " +
        'yang berakhlak mulia, cerdas, mandiri secara ekonomi, serta memberi ' +
        'kemaslahatan luas bagi umat, masyarakat, dan bangsa menuju tahun 2045.',
      mission: [
        'Mewujudkan ekosistem pendidikan pesantren terpadu (TKQ hingga SMA) yang unggul dan terakreditasi tinggi secara berkelanjutan.',
        'Menjadikan Yayasan sebagai pusat keunggulan tahfidz dan kajian keislaman rujukan wilayah Priangan Timur.',
        'Mewujudkan kemandirian ekonomi kelembagaan melalui unit usaha syariah dan wakaf produktif.',
        'Memperluas kemanfaatan sosial-kemanusiaan bagi masyarakat secara berkelanjutan dan merata.',
        'Mewujudkan tata kelola kelembagaan yang modern, transparan, dan adaptif.',
        'Berperan aktif mendukung SDM unggul lokal sebagai kontribusi terhadap Indonesia Emas 2045.',
      ].join('\n'),
      startDate: new Date('2027-01-01'),
      endDate: new Date('2045-12-31'),
      progress: 5,
      createdBy: { connect: { id: u.createdById } },
      approvedBy: { connect: { id: u.approvedById } },
      approvedAt: new Date('2026-12-20'),
      objectives: {
        create: [
          {
            order: 0,
            perspective: BSCPerspective.LEARNING,
            priority: PlanPriority.CRITICAL,
            weight: 30,
            progress: 10,
            title: 'Sasaran Visi 1 — Mutu pendidikan pesantren terpadu meningkat',
            description:
              'Seluruh satuan pendidikan formal terakreditasi unggul dan capaian hafalan ' +
              'lulusan meningkat sampai khatam 30 juz pada 2045.',
            indicators: {
              create: [
                indicator({
                  name: 'Satuan pendidikan formal terakreditasi A/Unggul', unit: 'unit',
                  baseline: 1, targetValue: 3, currentValue: 1, level: PlanIndicatorLevel.IUP,
                  definition: 'Jumlah satuan pendidikan formal (SDIT, SMP IT, SMA) berpredikat akreditasi A/Unggul.',
                  formula: 'COUNT(unit dengan peringkat A/Unggul)', dataSource: 'SK & Sispena BAN-PDM',
                  frequency: 'Tahunan', picRole: 'Pengurus & Kepala Sekolah',
                  targets: [
                    { period: 'Tahap I (2029)', targetValue: 1 },
                    { period: 'Tahap II (2034)', targetValue: 3 },
                    { period: 'Tahap III (2039)', targetValue: 3 },
                    { period: 'Tahap IV (2045)', targetValue: 3 },
                  ],
                }),
                indicator({
                  name: 'Rata-rata hafalan lulusan SMA (kumulatif)', unit: 'juz',
                  baseline: 6, targetValue: 30, currentValue: 6, level: PlanIndicatorLevel.IUP,
                  definition: "Rata-rata juz hafalan mutqin (lulus tasmi') seluruh lulusan SMA tahun berjalan.",
                  formula: 'AVG(juz hafalan lulusan SMA)', dataSource: 'Buku induk tahfidz pesantren',
                  frequency: 'Tahunan (kelulusan)', picRole: 'Koordinator Tahfidz',
                  targets: [
                    { period: 'Tahap I (2029)', targetValue: 10 },
                    { period: 'Tahap II (2034)', targetValue: 15 },
                    { period: 'Tahap III (2039)', targetValue: 22 },
                    { period: 'Tahap IV (2045)', targetValue: 30 },
                  ],
                }),
              ],
            },
          },
          {
            order: 1,
            perspective: BSCPerspective.FINANCIAL,
            priority: PlanPriority.HIGH,
            weight: 20,
            progress: 5,
            title: 'Sasaran Visi 2 — Kemandirian ekonomi kelembagaan meningkat',
            description: 'Kontribusi unit usaha syariah & wakaf produktif terhadap anggaran naik dari < 10% menjadi > 40%.',
            indicators: {
              create: [
                indicator({
                  name: 'Kontribusi pendanaan mandiri terhadap anggaran', unit: '%',
                  baseline: 10, targetValue: 40, currentValue: 10, level: PlanIndicatorLevel.IUP,
                  definition: 'Rasio pendapatan unit usaha & wakaf produktif terhadap total anggaran tahunan Yayasan.',
                  formula: '(Pendapatan mandiri ÷ Total anggaran) × 100%', dataSource: 'Laporan keuangan konsolidasi',
                  frequency: 'Tahunan', picRole: 'Bendahara & Manajer Unit Usaha',
                  targets: [
                    { period: 'Tahap I (2029)', targetValue: 10 },
                    { period: 'Tahap II (2034)', targetValue: 18 },
                    { period: 'Tahap III (2039)', targetValue: 30 },
                    { period: 'Tahap IV (2045)', targetValue: 40 },
                  ],
                }),
              ],
            },
          },
          {
            order: 2,
            perspective: BSCPerspective.CUSTOMER,
            priority: PlanPriority.HIGH,
            weight: 20,
            progress: 5,
            title: 'Sasaran Visi 3 — Kemanfaatan sosial-kemanusiaan meluas',
            description: 'Penerima manfaat santunan & beasiswa per tahun tumbuh dari ±40 menjadi 400+ orang.',
            indicators: {
              create: [
                indicator({
                  name: 'Penerima manfaat sosial per tahun', unit: 'orang',
                  baseline: 40, targetValue: 400, currentValue: 40, level: PlanIndicatorLevel.IUP,
                  definition: 'Jumlah orang unik penerima santunan/beasiswa/layanan sosial dalam satu tahun.',
                  formula: 'COUNT DISTINCT(penerima manfaat per tahun)', dataSource: 'Register penerima manfaat Bidang Sosial',
                  frequency: 'Tahunan', picRole: 'Koordinator Bidang Sosial',
                  targets: [
                    { period: 'Tahap I (2029)', targetValue: 85 },
                    { period: 'Tahap II (2034)', targetValue: 150 },
                    { period: 'Tahap III (2039)', targetValue: 250 },
                    { period: 'Tahap IV (2045)', targetValue: 400 },
                  ],
                }),
              ],
            },
          },
          {
            order: 3,
            perspective: BSCPerspective.PROCESS,
            priority: PlanPriority.MEDIUM,
            weight: 15,
            progress: 5,
            title: 'Sasaran Visi 4 — Tata kelola kelembagaan modern & akuntabel',
            description:
              'Dari laporan review internal & sistem informasi parsial menuju audit independen ' +
              'rutin dan sistem terintegrasi penuh. Skala 1 (review internal) – 5 (audit independen + sistem terintegrasi).',
            indicators: {
              create: [
                indicator({
                  name: 'Tingkat kematangan tata kelola & audit', unit: 'skala 1-5',
                  baseline: 1, targetValue: 5, currentValue: 1, level: PlanIndicatorLevel.IUP,
                  definition: 'Tingkat kematangan tata kelola: 1 review internal → 5 audit independen rutin + sistem informasi terintegrasi penuh.',
                  formula: 'Penilaian tahunan skala 1–5', dataSource: 'Laporan hasil review/audit',
                  frequency: 'Tahunan', picRole: 'Bendahara & Sekretaris Yayasan',
                  targets: [
                    { period: 'Tahap I (2029)', targetValue: 2 },
                    { period: 'Tahap II (2034)', targetValue: 3 },
                    { period: 'Tahap III (2039)', targetValue: 4 },
                    { period: 'Tahap IV (2045)', targetValue: 5 },
                  ],
                }),
              ],
            },
          },
          {
            order: 4,
            perspective: BSCPerspective.CUSTOMER,
            priority: PlanPriority.MEDIUM,
            weight: 15,
            progress: 5,
            title: 'Sasaran Visi 5 — Daya saing & pengakuan regional meningkat',
            description: 'Jangkauan pengakuan naik dari tingkat kecamatan menjadi rujukan Jawa Barat. Skala 1 (kecamatan) – 5 (Jawa Barat).',
            indicators: {
              create: [
                indicator({
                  name: 'Jangkauan pengakuan kelembagaan', unit: 'skala 1-5',
                  baseline: 1, targetValue: 5, currentValue: 1, level: PlanIndicatorLevel.IUP,
                  definition: 'Skala jangkauan pengakuan: 1 kecamatan → 3 Priangan Timur → 5 rujukan Jawa Barat.',
                  formula: 'Penilaian tahunan skala 1–5', dataSource: 'Status kemitraan & pengakuan eksternal',
                  frequency: 'Tahunan', picRole: 'Ketua Pengurus',
                  targets: [
                    { period: 'Tahap I (2029)', targetValue: 2 },
                    { period: 'Tahap II (2034)', targetValue: 3 },
                    { period: 'Tahap III (2039)', targetValue: 4 },
                    { period: 'Tahap IV (2045)', targetValue: 5 },
                  ],
                }),
              ],
            },
          },
        ],
      },
    },
  });

  // ───────────────────────────────────────────────────────────────────────
  // 2. Renstra 2027–2029 — SS1–SS5, each with its IKU and its Programs;
  //    each Program (kind PROGRAM) carries an IKP and nests its Kegiatan
  //    (kind KEGIATAN) with IKK targets per tahun 2027/2028/2029.
  // ───────────────────────────────────────────────────────────────────────
  type KegiatanSeed = {
    code: string;
    title: string;
    sasaran: string;
    ikk: { name: string; unit: string; y2027: number | null; y2028: number | null; y2029: number };
    picId: string;
  };
  type ProgramSeed = {
    code: string;
    name: string;
    outcome: string;
    ikp: string;
    picId: string;
    priority?: PlanPriority;
    kegiatan?: KegiatanSeed[];
  };

  const yearTargets = (k: KegiatanSeed['ikk']): StageTarget[] => {
    const t: StageTarget[] = [];
    if (k.y2027 !== null) t.push({ period: '2027', targetValue: k.y2027 });
    if (k.y2028 !== null) t.push({ period: '2028', targetValue: k.y2028 });
    t.push({ period: '2029', targetValue: k.y2029 });
    return t;
  };

  const program = (p: ProgramSeed): Prisma.PlanActivityCreateWithoutObjectiveInput => ({
    kind: PlanActivityKind.PROGRAM,
    code: p.code,
    title: `Program ${p.code}: ${p.name}`,
    description: p.outcome,
    priority: p.priority ?? PlanPriority.HIGH,
    status: PlanStatus.IN_PROGRESS,
    startDate: new Date('2027-01-01'),
    endDate: new Date('2029-12-31'),
    notes: `IKP (target akhir 2029): ${p.ikp}`,
    pic: { connect: { id: p.picId } },
    indicators: {
      create: [
        indicator({ name: `IKP — ${p.name}`, unit: 'status/nilai', targetValue: 100, level: PlanIndicatorLevel.IKP,
          definition: p.ikp, frequency: 'Semesteran' }),
      ],
    },
    // A Kegiatan belongs to its parent Program (objectiveId stays null); the
    // Program carries the objective. This is why PlanActivity.objectiveId is
    // nullable — a nested sub-activity inherits its Sasaran through the parent.
    children: p.kegiatan && p.kegiatan.length
      ? {
          create: p.kegiatan.map((k) => ({
            kind: PlanActivityKind.KEGIATAN,
            code: k.code,
            title: k.title,
            description: k.sasaran,
            priority: PlanPriority.MEDIUM,
            status: PlanStatus.IN_PROGRESS,
            startDate: new Date('2027-01-01'),
            endDate: new Date('2029-12-31'),
            pic: { connect: { id: k.picId } },
            indicators: {
              create: [
                indicator({
                  name: `IKK — ${k.ikk.name}`, unit: k.ikk.unit, targetValue: k.ikk.y2029,
                  currentValue: k.ikk.y2027 ?? 0, level: PlanIndicatorLevel.IKK,
                  frequency: 'Tahunan', targets: yearTargets(k.ikk),
                }),
              ],
            },
          })),
        }
      : undefined,
  });

  const ss1Programs: ProgramSeed[] = [
    { code: '1.A.1', name: 'Penguatan Kurikulum Payung Keislaman Lintas Jenjang',
      outcome: 'Kerangka kurikulum keislaman konsisten dari TK hingga SMA.',
      ikp: 'Diterapkan & disempurnakan di seluruh jenjang', picId: u.ketua,
      kegiatan: [
        { code: '1.A.1.a', title: 'Penyusunan kurikulum payung keislaman lintas jenjang', sasaran: '1 dokumen kurikulum payung acuan seluruh jenjang.',
          ikk: { name: 'Status dokumen kurikulum payung', unit: 'tahap', y2027: 1, y2028: 2, y2029: 3 }, picId: u.ketua },
      ] },
    { code: '1.A.2', name: 'Digitalisasi Sistem Informasi Akademik Terpadu ("Smart Pesantren")',
      outcome: 'Satu sistem informasi akademik & administrasi menaungi TKQ, SDIT, SMP IT, SMA.',
      ikp: 'Terintegrasi penuh 4 jenjang; 90% wali santri aktif', picId: u.sekretaris,
      kegiatan: [
        { code: '1.A.2.a', title: 'Pengadaan & pengembangan aplikasi informasi akademik terpadu', sasaran: 'Satu sistem informasi untuk seluruh jenjang.',
          ikk: { name: 'Cakupan integrasi sistem', unit: 'jenjang', y2027: 2, y2028: 3, y2029: 4 }, picId: u.sekretaris },
        { code: '1.A.2.b', title: 'Migrasi pembayaran SPP & asrama ke non-tunai', sasaran: 'Transparansi transaksi keuangan dengan wali santri meningkat.',
          ikk: { name: 'Transaksi SPP non-tunai', unit: '%', y2027: 40, y2028: 75, y2029: 100 }, picId: u.sekretaris },
      ] },
    { code: '1.A.3', name: 'Peningkatan Kompetensi Pendidik Lintas Jenjang',
      outcome: 'Kualifikasi & sertifikasi pendidik meningkat merata.',
      ikp: '90% pendidik tersertifikasi/berkualifikasi', picId: u.koordinator,
      kegiatan: [
        { code: '1.A.3.a', title: 'Fasilitasi sertifikasi & studi lanjut guru', sasaran: 'Jumlah guru bersertifikat/berkualifikasi S1 meningkat.',
          ikk: { name: 'Guru difasilitasi sertifikasi/studi', unit: 'orang/th', y2027: 7, y2028: 9, y2029: 9 }, picId: u.koordinator },
      ] },
    { code: '1.A.4', name: 'Pengembangan Fasilitas Bersama & Eco-Pesantren Sehat',
      outcome: 'Fasilitas ibadah, aula, asrama representatif, sehat, ramah lingkungan.',
      ikp: 'Difungsikan penuh; sanitasi terstandar', picId: u.ketua },
    { code: '1.A.5', name: 'Pesantren Ramah Anak (Selaras KMA No. 91/2025)',
      outcome: 'Lingkungan pesantren aman, bebas kekerasan, ramah anak di seluruh jenjang.',
      ikp: 'Fase Kemandirian PRA tercapai; nihil kasus tidak tertangani', picId: u.koordinator,
      kegiatan: [
        { code: '1.A.5.a', title: 'Pembentukan unit BK & pelatihan guru BK ramah anak', sasaran: 'Layanan BK profesional di seluruh jenjang.',
          ikk: { name: 'Unit sekolah dengan BK aktif (kumulatif)', unit: 'unit', y2027: 2, y2028: 3, y2029: 4 }, picId: u.koordinator },
      ] },
    { code: '1.C.1', name: 'Penguatan Mutu Akademik & Akreditasi SDIT',
      outcome: 'Mutu pembelajaran dasar meningkat & akreditasi A SDIT terjaga.',
      ikp: 'A (dipertahankan melalui reakreditasi)', picId: u.kepalaSd,
      kegiatan: [
        { code: '1.C.1.a', title: 'Penguatan literasi & numerasi dasar (calistung)', sasaran: 'Kemampuan baca-tulis-hitung siswa kelas 1–3 meningkat.',
          ikk: { name: 'Siswa kelas awal mencapai standar calistung', unit: '%', y2027: 80, y2028: 90, y2029: 95 }, picId: u.kepalaSd },
      ] },
    { code: '1.C.2', name: 'Perluasan Akses & Sarpras SDIT',
      outcome: 'Jumlah peserta didik, beasiswa, & sarpras dasar SDIT meningkat.',
      ikp: '+35% siswa (kumulatif 3 tahun); sarpras 100%', picId: u.kepalaSd, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '1.C.2.a', title: 'Beasiswa & subsidi silang santri dhuafa/yatim jenjang SD', sasaran: 'Beasiswa bagi siswa SD kurang mampu tersalurkan.',
          ikk: { name: 'Penerima beasiswa SD', unit: 'siswa/th', y2027: 8, y2028: 10, y2029: 12 }, picId: u.kepalaSd },
      ] },
    { code: '1.D.1', name: 'Penguatan Mutu Akademik & Akreditasi SMP IT',
      outcome: 'Mutu pembelajaran & status akreditasi SMP IT naik dari B menuju A.',
      ikp: 'A', picId: u.kepalaSmp },
    { code: '1.D.2', name: 'Pemenuhan Sarpras & Akses SMP IT',
      outcome: 'Sarpras laboratorium terpenuhi & akses/beasiswa siswa SMP meningkat.',
      ikp: '100% sarpras; 10 penerima beasiswa', picId: u.kepalaSmp, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '1.D.2.a', title: 'Pengembangan laboratorium IPA & komputer SMP', sasaran: 'Laboratorium layak untuk praktik.',
          ikk: { name: 'Capaian standar laboratorium SMP', unit: '%', y2027: 70, y2028: 90, y2029: 100 }, picId: u.kepalaSmp },
      ] },
    { code: '1.E.1', name: "Penguatan Mutu Akademik & Akreditasi SMA Qur'an",
      outcome: "Mutu & akreditasi SMA Qur'an (berdiri 2023) meningkat.",
      ikp: 'A', picId: u.kepalaSma },
    { code: '1.E.2', name: 'Bimbingan Karier, PTN & Kewirausahaan Santri',
      outcome: 'Keterserapan lulusan ke PT/dunia kerja & jiwa kewirausahaan meningkat.',
      ikp: '50% lulusan terserap PTN/kerja', picId: u.kepalaSma, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '1.E.2.a', title: 'Bimbingan karier & try out PTN', sasaran: 'Bimbingan karier terjadwal bagi kelas akhir.',
          ikk: { name: 'Lulusan diterima PTN/dunia kerja', unit: '%', y2027: 30, y2028: 40, y2029: 50 }, picId: u.kepalaSma },
      ] },
    { code: '1.E.3', name: 'Pemenuhan Sarpras SMA',
      outcome: 'Sarana laboratorium & referensi belajar memadai bagi SMA.',
      ikp: '100%', picId: u.kepalaSma, priority: PlanPriority.MEDIUM },
  ];

  const ss2Programs: ProgramSeed[] = [
    { code: '2.1', name: 'Penguatan Tahfidz & Tahsin Berjenjang',
      outcome: "Capaian hafalan Al-Qur'an santri meningkat bertingkat sesuai jenjang.",
      ikp: 'Rata-rata hafalan lulusan SMA 10 juz', picId: u.koordinator,
      kegiatan: [
        { code: '2.1.a', title: 'Pembinaan tahfidz intensif santri SMA', sasaran: 'Target hafalan menjelang kelulusan SMA tercapai.',
          ikk: { name: 'Hafalan lulusan SMA (kumulatif)', unit: 'juz', y2027: 8, y2028: 9, y2029: 10 }, picId: u.koordinator },
        { code: '2.1.b', title: 'Halaqah & kajian kitab rutin lintas jenjang', sasaran: 'Frekuensi kajian rutin meningkat.',
          ikk: { name: 'Halaqah/kajian per pekan', unit: 'halaqah', y2027: 8, y2028: 10, y2029: 12 }, picId: u.koordinator },
      ] },
    { code: '2.2', name: "Penguatan TKQ sebagai Pintu Masuk Generasi Qur'ani",
      outcome: 'TKQ aman & mendidik sebagai jenjang non-formal keagamaan pertama.',
      ikp: '80 santri TKQ aktif', picId: u.koordinator, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '2.2.a', title: 'Penerimaan & pembinaan santri TKQ', sasaran: 'Jumlah santri TKQ bertambah.',
          ikk: { name: 'Santri TKQ aktif', unit: 'santri', y2027: 55, y2028: 70, y2029: 80 }, picId: u.koordinator },
      ] },
    { code: '2.3', name: 'Dakwah & Pembinaan Masyarakat Sekitar',
      outcome: 'Jangkauan syiar & layanan keagamaan masyarakat sekitar meningkat.',
      ikp: '5 majelis taklim binaan; KBIH beroperasi', picId: u.koordinator, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '2.3.a', title: 'Pembinaan & pendampingan majelis taklim', sasaran: 'Majelis taklim binaan aktif bertambah.',
          ikk: { name: 'Majelis taklim binaan', unit: 'majelis', y2027: 3, y2028: 4, y2029: 5 }, picId: u.koordinator },
      ] },
    { code: '2.4', name: 'Pengelolaan ZISWAF dan Qurban',
      outcome: 'Penghimpunan & penyaluran ZISWAF dan hewan qurban optimal.',
      ikp: 'Rp350 juta ZISWAF per tahun', picId: u.koordinator, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '2.4.a', title: 'Penghimpunan & penyaluran ZISWAF', sasaran: 'Dana ZISWAF terhimpun & tersalurkan meningkat.',
          ikk: { name: 'Dana ZISWAF per tahun', unit: 'Rp juta', y2027: 200, y2028: 275, y2029: 350 }, picId: u.koordinator },
      ] },
  ];

  const ss3Programs: ProgramSeed[] = [
    { code: '3.1', name: 'Santunan & Perlindungan Sosial',
      outcome: 'Jumlah & kualitas layanan santunan bagi yatim, dhuafa, masyarakat meningkat.',
      ikp: '85 penerima santunan per tahun', picId: u.koordinator,
      kegiatan: [
        { code: '3.1.a', title: 'Santunan rutin anak yatim & dhuafa', sasaran: 'Jumlah penerima santunan bertambah.',
          ikk: { name: 'Penerima santunan per tahun', unit: 'orang', y2027: 55, y2028: 70, y2029: 85 }, picId: u.koordinator },
      ] },
    { code: '3.2', name: 'Pemberdayaan Ekonomi & Tanggap Bencana',
      outcome: 'Kemandirian ekonomi keluarga dhuafa & kesiapsiagaan bencana meningkat.',
      ikp: '25 KK penerima manfaat pemberdayaan', picId: u.koordinator, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '3.2.a', title: 'Pelatihan & pendampingan usaha kecil keluarga dhuafa', sasaran: 'Keluarga penerima manfaat pemberdayaan bertambah.',
          ikk: { name: 'KK penerima pemberdayaan', unit: 'KK', y2027: 15, y2028: 20, y2029: 25 }, picId: u.koordinator },
      ] },
    { code: '3.3', name: 'Kepedulian Lingkungan Hidup',
      outcome: 'Kualitas & kelestarian lingkungan pesantren & sekitarnya meningkat.',
      ikp: '3 kegiatan pelestarian lingkungan per tahun', picId: u.koordinator, priority: PlanPriority.LOW,
      kegiatan: [
        { code: '3.3.a', title: 'Penghijauan & kebersihan lingkungan pesantren', sasaran: 'Kegiatan penghijauan rutin terlaksana.',
          ikk: { name: 'Kegiatan lingkungan per tahun', unit: 'kegiatan', y2027: 2, y2028: 2, y2029: 3 }, picId: u.koordinator },
      ] },
  ];

  const ss4Programs: ProgramSeed[] = [
    { code: '4.1', name: 'Penguatan Tata Kelola & Kepatuhan Regulasi',
      outcome: 'Kepatuhan administrasi Yayasan sesuai UU Yayasan & peraturan pendidikan.',
      ikp: '100% kepatuhan pelaporan tahunan & perizinan', picId: u.sekretaris,
      kegiatan: [
        { code: '4.1.a', title: 'Rapat Pembina & laporan tahunan tepat waktu', sasaran: 'Rapat & laporan tahunan terlaksana tepat waktu (Ps. 35 AD).',
          ikk: { name: 'Ketepatan pelaporan tahunan', unit: '%', y2027: 100, y2028: 100, y2029: 100 }, picId: u.sekretaris },
      ] },
    { code: '4.2', name: 'Penguatan Akuntabilitas Keuangan',
      outcome: 'Transparansi & akuntabilitas pengelolaan keuangan Yayasan meningkat.',
      ikp: 'Laporan keuangan diaudit rutin', picId: u.bendahara,
      kegiatan: [
        { code: '4.2.a', title: 'Penyusunan & review/audit laporan keuangan tahunan', sasaran: 'Laporan keuangan sesuai standar akuntansi.',
          ikk: { name: 'Status audit laporan keuangan', unit: 'skala 1-4', y2027: 2, y2028: 3, y2029: 3 }, picId: u.bendahara },
      ] },
    { code: '4.3', name: 'Pengembangan Kapasitas SDM Kepengurusan',
      outcome: 'Kapasitas manajerial Pembina, Pengurus, Pengawas & kepala unit meningkat.',
      ikp: '4 pelatihan/bimtek pengurus per tahun', picId: u.ketua, priority: PlanPriority.MEDIUM,
      kegiatan: [
        { code: '4.3.a', title: 'Pelatihan manajemen kelembagaan & keuangan yayasan', sasaran: 'Pelatihan bagi pengurus & kepala unit terlaksana.',
          ikk: { name: 'Pelatihan pengurus per tahun', unit: 'kali', y2027: 3, y2028: 4, y2029: 4 }, picId: u.ketua },
      ] },
  ];

  const ss5Programs: ProgramSeed[] = [
    { code: '4.4', name: 'Kemandirian Finansial melalui Vokasi & OPOP',
      outcome: 'Kontribusi pendanaan mandiri meningkat via BLK Bahasa, Kopontren, OPOP.',
      ikp: '4 unit usaha aktif; meraih pengakuan OPOP berprestasi', picId: u.koordinator,
      kegiatan: [
        { code: '4.4.a', title: 'Optimalisasi BLK Kejuruan Bahasa (Arab-Inggris)', sasaran: 'BLK berjalan sebagai sumber pendapatan & skill santri.',
          ikk: { name: 'Peserta kursus BLK', unit: 'peserta', y2027: 20, y2028: 35, y2029: 50 }, picId: u.koordinator },
      ] },
  ];

  const ssObjective = (
    order: number, perspective: BSCPerspective, priority: PlanPriority, weight: number, progress: number,
    title: string, description: string, iku: IndicatorSeed[], programs: ProgramSeed[]
  ): Prisma.PlanObjectiveCreateWithoutPlanInput => ({
    order, perspective, priority, weight, progress, title, description,
    indicators: { create: iku.map(indicator) },
    activities: { create: programs.map(program) },
  });

  const renstra = await prisma.strategicPlan.create({
    data: {
      parent: { connect: { id: rpjp.id } },
      type: PlanType.RENSTRA,
      status: PlanStatus.IN_PROGRESS,
      title: 'Renstra Yayasan Pesantren Cipansor 2027–2029 (Tahap I RPJP)',
      description:
        'Rencana Strategis penjabaran Tahap I RPJP (kerangka SAKIP): ' +
        'Visi → Misi → Tujuan → Sasaran Strategis → Program (IKP) → Kegiatan (IKK, target tahunan). ' +
        'Tema tahap: Penguatan Fondasi Mutu dan Tata Kelola. Mock-up demo.',
      vision:
        "Menjadi lembaga pesantren dan pendidikan terpadu yang unggul dalam membentuk " +
        "generasi Qur'ani, berakhlak mulia, cerdas, mandiri, dan bermanfaat bagi umat, " +
        'masyarakat, dan bangsa pada tahun 2029.',
      mission: [
        'Menyelenggarakan pendidikan formal (SD, SMP, SMA) yang bermutu, terakreditasi, dan terintegrasi dengan nilai keislaman.',
        'Menguatkan pembinaan tahfidz, tahsin, dan kajian keagamaan sebagai ciri khas pesantren.',
        'Mengembangkan program sosial-kemanusiaan yang berpihak kepada yatim, dhuafa, dan masyarakat sekitar.',
        'Membangun tata kelola kelembagaan yang profesional, transparan, dan akuntabel.',
        'Mengembangkan kemandirian ekonomi Yayasan melalui unit usaha dan wakaf produktif.',
      ].join('\n'),
      startDate: new Date('2027-01-01'),
      endDate: new Date('2029-12-31'),
      progress: 22,
      createdBy: { connect: { id: u.createdById } },
      approvedBy: { connect: { id: u.approvedById } },
      approvedAt: new Date('2026-12-27'),
      objectives: {
        create: [
          ssObjective(0, BSCPerspective.CUSTOMER, PlanPriority.CRITICAL, 30, 25,
            'SS1 — Meningkatnya mutu & akses pendidikan formal (SD, SMP, SMA) serta TKQ',
            'Mutu & akses pendidikan formal tiga jenjang naik, TKQ menguat, kompetensi pendidik meningkat.',
            [
              { name: 'Satuan pendidikan formal terakreditasi A', unit: 'unit', baseline: 1, targetValue: 3, currentValue: 1, level: PlanIndicatorLevel.IKU,
                definition: 'Status/peringkat akreditasi tiap unit formal berdasarkan SK BAN-PDM terakhir.', formula: 'COUNT(unit A)', dataSource: 'SK & Sispena BAN-PDM', frequency: 'Tahunan', picRole: 'Pengurus & Kepala Sekolah',
                targets: [{ period: '2027', targetValue: 1 }, { period: '2028', targetValue: 2 }, { period: '2029', targetValue: 3 }] },
              { name: 'Pendidik tersertifikasi/berkualifikasi', unit: '%', baseline: 60, targetValue: 90, currentValue: 65, level: PlanIndicatorLevel.IKU,
                definition: '(Pendidik bersertifikat atau berkualifikasi min. S1 ÷ total pendidik) × 100%.', formula: '(Σ bersertifikat ÷ Σ pendidik) × 100%', dataSource: 'Data kepegawaian Yayasan', frequency: 'Semesteran', picRole: 'Sekretaris Yayasan',
                targets: [{ period: '2027', targetValue: 75 }, { period: '2028', targetValue: 85 }, { period: '2029', targetValue: 90 }] },
            ], ss1Programs),
          ssObjective(1, BSCPerspective.LEARNING, PlanPriority.HIGH, 20, 20,
            'SS2 — Menguatnya program tahfidz, dakwah, & syiar keagamaan',
            'Capaian hafalan meningkat berjenjang, TKQ menguat, dakwah meluas, ZISWAF optimal.',
            [
              { name: 'Rata-rata hafalan lulusan SMA (kumulatif)', unit: 'juz', baseline: 6, targetValue: 10, currentValue: 8, level: PlanIndicatorLevel.IKU,
                definition: "Rata-rata juz hafalan mutqin lulusan SMA.", dataSource: 'Buku induk tahfidz', frequency: 'Tahunan', picRole: 'Koordinator Tahfidz',
                targets: [{ period: '2027', targetValue: 8 }, { period: '2028', targetValue: 9 }, { period: '2029', targetValue: 10 }] },
              { name: 'Dana ZISWAF terhimpun & tersalurkan per tahun', unit: 'Rp juta', baseline: 150, targetValue: 350, currentValue: 200, level: PlanIndicatorLevel.IKU,
                dataSource: 'Laporan Bidang Keagamaan & ZISWAF', frequency: 'Triwulanan', picRole: 'Koordinator Keagamaan',
                targets: [{ period: '2027', targetValue: 200 }, { period: '2028', targetValue: 275 }, { period: '2029', targetValue: 350 }] },
            ], ss2Programs),
          ssObjective(2, BSCPerspective.CUSTOMER, PlanPriority.MEDIUM, 15, 20,
            'SS3 — Meningkatnya jangkauan & kualitas program sosial-kemanusiaan',
            'Santunan meluas, pemberdayaan ekonomi dhuafa berjalan, kepedulian lingkungan meningkat.',
            [
              { name: 'Penerima manfaat program sosial per tahun', unit: 'orang', baseline: 40, targetValue: 85, currentValue: 55, level: PlanIndicatorLevel.IKU,
                definition: 'Jumlah orang unik penerima santunan/beasiswa/layanan sosial per tahun.', dataSource: 'Register Bidang Sosial', frequency: 'Triwulanan', picRole: 'Koordinator Sosial',
                targets: [{ period: '2027', targetValue: 55 }, { period: '2028', targetValue: 70 }, { period: '2029', targetValue: 85 }] },
            ], ss3Programs),
          ssObjective(3, BSCPerspective.PROCESS, PlanPriority.HIGH, 15, 18,
            'SS4 — Terwujudnya tata kelola Yayasan yang transparan & akuntabel',
            'Kepatuhan administrasi, akuntabilitas keuangan, & kapasitas kepengurusan menguat.',
            [
              { name: 'Status audit laporan keuangan', unit: 'skala 1-4', baseline: 1, targetValue: 3, currentValue: 2, level: PlanIndicatorLevel.IKU,
                definition: 'Status tertinggi pemeriksaan laporan keuangan: 1 review internal → 4 audit independen.', dataSource: 'Laporan hasil review/audit', frequency: 'Tahunan', picRole: 'Bendahara Yayasan',
                targets: [{ period: '2027', targetValue: 2 }, { period: '2028', targetValue: 3 }, { period: '2029', targetValue: 3 }] },
            ], ss4Programs),
          ssObjective(4, BSCPerspective.FINANCIAL, PlanPriority.HIGH, 20, 15,
            'SS5 — Meningkatnya kemandirian finansial Yayasan',
            'Kontribusi pendanaan mandiri meningkat via unit usaha vokasi & kemitraan OPOP Jawa Barat.',
            [
              { name: 'Unit usaha/wakaf produktif aktif', unit: 'unit', baseline: 0, targetValue: 4, currentValue: 1, level: PlanIndicatorLevel.IKU,
                definition: 'Jumlah unit usaha (BLK, Kopontren, OPOP, wakaf produktif) yang beroperasi rutin.', dataSource: 'Laporan unit usaha', frequency: 'Semesteran', picRole: 'Manajer Unit Usaha',
                targets: [{ period: '2027', targetValue: 2 }, { period: '2028', targetValue: 3 }, { period: '2029', targetValue: 4 }] },
              { name: 'Kontribusi pendapatan mandiri terhadap anggaran', unit: '%', baseline: 8, targetValue: 12, currentValue: 8, level: PlanIndicatorLevel.IKU,
                dataSource: 'Laporan keuangan konsolidasi', frequency: 'Tahunan', picRole: 'Bendahara & Manajer Unit Usaha',
                targets: [{ period: '2027', targetValue: 8 }, { period: '2028', targetValue: 10 }, { period: '2029', targetValue: 12 }] },
            ], ss5Programs),
        ],
      },
    },
  });

  // ───────────────────────────────────────────────────────────────────────
  // 3. RKA 2027 — 24 kegiatan with IKK (triwulanan), jadwal bulanan, RAB rinci;
  //    plan-level funding sources. Objectives = the five bidang.
  // ───────────────────────────────────────────────────────────────────────
  type RabLine = { description: string; volume: number; unit: string; unitPriceJt?: number };
  let rkaTotal = 0;
  const kegiatan = (
    code: string, name: string, sasaran: string, picId: string, priority: PlanPriority, status: PlanStatus,
    months: number[], ikk: IndicatorSeed | null, rab: RabLine[], period?: { start: string; end: string }
  ): Prisma.PlanActivityCreateWithoutObjectiveInput => {
    const budget = rab.reduce((s, r) => s + (r.unitPriceJt ?? 0) * r.volume * JT, 0);
    rkaTotal += budget;
    return {
      kind: PlanActivityKind.KEGIATAN,
      code,
      title: `${code}: ${name}`,
      description: sasaran,
      priority,
      status,
      startDate: new Date(period?.start ?? '2027-01-01'),
      endDate: new Date(period?.end ?? '2027-12-31'),
      scheduleMonths: months,
      budget: D(budget),
      notes: `Total RAB Rp${(budget / JT).toLocaleString('id-ID')} juta${IND}`,
      pic: { connect: { id: picId } },
      indicators: ikk ? { create: [indicator(ikk)] } : undefined,
      budgetItems: {
        create: rab.map((r, idx) => ({
          order: idx,
          description: r.description,
          volume: r.volume,
          unit: r.unit,
          unitPrice: r.unitPriceJt ? D(r.unitPriceJt * JT) : null,
          amount: r.unitPriceJt ? D(r.unitPriceJt * r.volume * JT) : null,
        })),
      },
    };
  };
  const q = (name: string, unit: string, tw: [number, number, number, number], target: number, current: number): IndicatorSeed => ({
    name: `IKK — ${name}`, unit, targetValue: target, currentValue: current, level: PlanIndicatorLevel.IKK, frequency: 'Triwulanan',
    targets: ['TW I', 'TW II', 'TW III', 'TW IV'].map((p, i) => ({ period: p, targetValue: tw[i] })),
  });

  const rkaObjectives: Prisma.PlanObjectiveCreateWithoutPlanInput[] = [
    {
      order: 0, perspective: BSCPerspective.CUSTOMER, priority: PlanPriority.CRITICAL, weight: 45, progress: 45,
      title: 'Bidang Pendidikan (SS1) — mutu, akreditasi & sarpras',
      description: 'Prioritas 1 — K-01 s.d. K-12.',
      activities: { create: [
        kegiatan('K-01', 'Kurikulum Payung Keislaman & Pemetaan Transisi', 'Kurikulum payung TK–SMA & pemetaan transisi tersusun, mulai diterapkan TP 2027/2028.', u.ketua, PlanPriority.HIGH, PlanStatus.COMPLETED, ALL_MONTHS, null,
          [{ description: 'Honorarium tim penyusun kurikulum', volume: 1, unit: 'paket', unitPriceJt: 12 }, { description: 'FGD/rapat kerja kurikulum', volume: 4, unit: 'kali', unitPriceJt: 2.5 }, { description: 'Penggandaan dokumen & ATK', volume: 1, unit: 'paket', unitPriceJt: 3 }]),
        kegiatan('K-02', '"Smart Pesantren", Migrasi Non-Tunai & Pelatihan Operator', 'Aplikasi akademik terpasang & uji coba SD–SMP; 40% SPP non-tunai; operator terlatih.', u.sekretaris, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Transaksi SPP non-tunai', '%', [10, 20, 30, 40], 40, 20),
          [{ description: 'Pengembangan/lisensi aplikasi terpadu', volume: 1, unit: 'paket', unitPriceJt: 120 }, { description: 'Server/hosting & langganan', volume: 12, unit: 'bulan', unitPriceJt: 2 }, { description: 'Pelatihan operator & guru', volume: 2, unit: 'kali', unitPriceJt: 3 }]),
        kegiatan('K-03', 'Pelatihan HOTS & Fasilitasi Sertifikasi Pendidik', '3 pelatihan pembelajaran aktif & fasilitasi sertifikasi 7 guru.', u.koordinator, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          q('Guru difasilitasi sertifikasi', 'orang', [2, 4, 6, 7], 7, 4),
          [{ description: 'Narasumber & paket pelatihan', volume: 3, unit: 'kali', unitPriceJt: 8 }, { description: 'Fasilitasi sertifikasi/studi lanjut guru', volume: 7, unit: 'orang', unitPriceJt: 5 }], { start: '2027-02-01', end: '2027-11-30' }),
        kegiatan('K-04', 'Fasilitas Bersama (Masjid/Aula, Asrama Tahap 1) & Eco-Pesantren', 'Pembangunan masjid/aula & asrama tahap 1 dimulai; sanitasi & Bank Sampah.', u.ketua, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS, null,
          [{ description: 'Penyusunan DED & perizinan (IMB/PBG)', volume: 1, unit: 'paket', unitPriceJt: 60 }, { description: 'Konstruksi masjid/aula tahap 2027', volume: 1, unit: 'paket', unitPriceJt: 850 }, { description: 'Konstruksi asrama tahap 1', volume: 1, unit: 'paket', unitPriceJt: 560 }, { description: 'Perbaikan sanitasi & pengurasan septik', volume: 2, unit: 'siklus', unitPriceJt: 12 }, { description: 'Sarana pemilahan sampah & komposter', volume: 1, unit: 'paket', unitPriceJt: 6 }]),
        kegiatan('K-05', 'Pesantren Ramah Anak: Unit BK, Kode Etik & Satgas', 'BK aktif 2 unit; kode etik & Satgas terbentuk; kanal pengaduan tersedia.', u.koordinator, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Unit BK aktif (kumulatif)', 'unit', [0, 2, 2, 2], 2, 2),
          [{ description: 'Pelatihan guru BK & pengasuhan ramah anak', volume: 2, unit: 'kali', unitPriceJt: 8 }, { description: 'Penyusunan & sosialisasi kode etik', volume: 1, unit: 'paket', unitPriceJt: 15 }, { description: 'Sarana kanal pengaduan', volume: 1, unit: 'paket', unitPriceJt: 9 }]),
        kegiatan('K-06', 'Reakreditasi & Penguatan Calistung SDIT', 'Berkas reakreditasi SDIT diajukan; 80% siswa kelas awal capai standar calistung.', u.kepalaSd, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Siswa kelas awal capai standar calistung', '%', [70, 75, 78, 80], 80, 75),
          [{ description: 'Pendampingan & dokumen reakreditasi', volume: 1, unit: 'paket', unitPriceJt: 12 }, { description: 'Media & program calistung', volume: 2, unit: 'semester', unitPriceJt: 4 }]),
        kegiatan('K-07', 'PPDB, Beasiswa & Sarpras SDIT', 'Siswa SDIT +10%; 8 beasiswa; sarpras 75%.', u.kepalaSd, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          q('Penerima beasiswa SD', 'siswa', [8, 8, 8, 8], 8, 8),
          [{ description: 'Promosi & penyelenggaraan PPDB', volume: 1, unit: 'paket', unitPriceJt: 20 }, { description: 'Beasiswa siswa SD dhuafa/yatim', volume: 8, unit: 'siswa', unitPriceJt: 5 }, { description: 'Pengembangan ruang kelas & perpustakaan SD', volume: 1, unit: 'paket', unitPriceJt: 60 }]),
        kegiatan('K-08', 'Akreditasi & Pembinaan Remaja SMP IT', 'Berkas kenaikan status disiapkan; 3 sesi pembinaan remaja.', u.kepalaSmp, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Sesi pembinaan karakter remaja', 'sesi', [1, 1, 2, 3], 3, 1),
          [{ description: 'Pendampingan persiapan akreditasi', volume: 1, unit: 'paket', unitPriceJt: 15 }, { description: 'Sesi pembinaan karakter remaja', volume: 3, unit: 'kali', unitPriceJt: 3.3 }]),
        kegiatan('K-09', 'Laboratorium & Beasiswa SMP IT', 'Lab 70%; 7 beasiswa SMP.', u.kepalaSmp, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, [1, 3, 4, 5, 6, 7, 8, 9, 10],
          q('Penerima beasiswa SMP', 'siswa', [7, 7, 7, 7], 7, 7),
          [{ description: 'Peralatan laboratorium IPA & komputer', volume: 1, unit: 'paket', unitPriceJt: 55 }, { description: 'Beasiswa siswa SMP dhuafa/yatim', volume: 7, unit: 'siswa', unitPriceJt: 5 }]),
        kegiatan('K-10', "Akreditasi Perdana & Guru Mapel SMA Qur'an", 'Berkas akreditasi perdana SMA diajukan; 80% mapel diampu guru sesuai kualifikasi.', u.kepalaSma, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Mapel diampu guru sesuai kualifikasi', '%', [80, 80, 80, 80], 80, 80),
          [{ description: 'Pendampingan akreditasi perdana', volume: 1, unit: 'paket', unitPriceJt: 18 }, { description: 'Rekrutmen & penguatan guru mapel', volume: 1, unit: 'paket', unitPriceJt: 17 }]),
        kegiatan('K-11', 'Karier/PTN & Kewirausahaan Santri SMA', '30% lulusan terserap PTN/kerja; 15 siswa kewirausahaan/magang.', u.kepalaSma, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Peserta kewirausahaan/magang', 'siswa', [0, 0, 8, 15], 15, 8),
          [{ description: 'Try out & bimbingan karier', volume: 3, unit: 'kali', unitPriceJt: 5 }, { description: 'Program kewirausahaan & magang', volume: 15, unit: 'siswa', unitPriceJt: 1 }]),
        kegiatan('K-12', 'Laboratorium & Referensi SMA', 'Capaian sarpras SMA 70%.', u.kepalaSma, PlanPriority.MEDIUM, PlanStatus.DRAFT, [3, 4, 5, 6, 7, 8, 9, 10, 11],
          q('Capaian standar sarpras SMA', '%', [30, 50, 60, 70], 70, 50),
          [{ description: 'Peralatan laboratorium SMA', volume: 1, unit: 'paket', unitPriceJt: 60 }, { description: 'Buku & referensi perpustakaan', volume: 1, unit: 'paket', unitPriceJt: 20 }], { start: '2027-03-01', end: '2027-11-30' }),
      ] },
    },
    {
      order: 1, perspective: BSCPerspective.LEARNING, priority: PlanPriority.HIGH, weight: 15, progress: 50,
      title: 'Bidang Keagamaan & Dakwah (SS2) — tahfidz, TKQ, dakwah & ZISWAF',
      description: 'Prioritas 2 — K-13 s.d. K-16.',
      activities: { create: [
        kegiatan('K-13', 'Tahfidz-Tahsin Berjenjang & Halaqah Rutin', 'Hafalan lulusan SD 2 / SMP 4 / SMA 8 juz; 8 halaqah/pekan.', u.koordinator, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Halaqah/kajian per pekan', 'halaqah', [6, 7, 8, 8], 8, 7),
          [{ description: 'Bisyaroh pembina tahfidz & tahsin', volume: 12, unit: 'bulan', unitPriceJt: 13 }, { description: "Wisuda tahfidz & tasmi' akbar", volume: 1, unit: 'kali', unitPriceJt: 15 }, { description: "Mushaf, kitab & buku mutaba'ah", volume: 1, unit: 'paket', unitPriceJt: 9 }]),
        kegiatan('K-14', 'Penerimaan-Pembinaan Santri TKQ, APE & Pelatihan Pengajar', '55 santri TKQ aktif; APE lengkap; 2 pengajar terlatih.', u.koordinator, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Santri TKQ aktif', 'santri', [42, 45, 55, 55], 55, 45),
          [{ description: 'APE & sarana bermain-belajar aman', volume: 1, unit: 'paket', unitPriceJt: 20 }, { description: 'Pelatihan pengajar TKQ', volume: 2, unit: 'orang', unitPriceJt: 2.5 }, { description: 'Operasional pembinaan TKQ', volume: 12, unit: 'bulan', unitPriceJt: 1.67 }]),
        kegiatan('K-15', 'Pembinaan Majelis Taklim & Izin KBIH', '3 majelis taklim binaan; izin KBIH terbit.', u.koordinator, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Majelis taklim binaan', 'majelis', [2, 2, 3, 3], 3, 2),
          [{ description: 'Operasional pembinaan majelis taklim', volume: 12, unit: 'bulan', unitPriceJt: 1.5 }, { description: 'Pengurusan izin & kelengkapan KBIH', volume: 1, unit: 'paket', unitPriceJt: 12 }]),
        kegiatan('K-16', 'Penghimpunan-Penyaluran ZISWAF & Qurban', 'ZISWAF Rp200 juta (indikatif); 30 ekor qurban.', u.koordinator, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Dana ZISWAF terhimpun', 'Rp juta', [60, 110, 150, 200], 200, 110),
          [{ description: 'Operasional penghimpunan & publikasi ZISWAF', volume: 1, unit: 'paket', unitPriceJt: 15 }, { description: 'Kepanitiaan & distribusi qurban', volume: 1, unit: 'kali', unitPriceJt: 10 }]),
      ] },
    },
    {
      order: 2, perspective: BSCPerspective.CUSTOMER, priority: PlanPriority.MEDIUM, weight: 10, progress: 55,
      title: 'Bidang Sosial & Kemanusiaan (SS3) — santunan, pemberdayaan & lingkungan',
      description: 'Prioritas 3 — K-17 s.d. K-19.',
      activities: { create: [
        kegiatan('K-17', 'Santunan Yatim-Dhuafa & Layanan Jenazah', '55 penerima santunan; layanan jenazah ditingkatkan.', u.koordinator, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Penerima santunan', 'orang', [40, 48, 52, 55], 55, 48),
          [{ description: 'Santunan yatim & dhuafa', volume: 55, unit: 'orang', unitPriceJt: 2 }, { description: 'Perlengkapan & operasional layanan jenazah', volume: 1, unit: 'paket', unitPriceJt: 30 }]),
        kegiatan('K-18', 'Pemberdayaan Usaha Dhuafa & Tanggap Bencana', '15 KK terdampingi; 3 aksi kemanusiaan.', u.koordinator, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('KK penerima pemberdayaan', 'KK', [3, 7, 11, 15], 15, 7),
          [{ description: 'Pelatihan & stimulan usaha keluarga dhuafa', volume: 15, unit: 'KK', unitPriceJt: 3 }, { description: 'Dana siaga tanggap bencana & aksi sosial', volume: 3, unit: 'aksi', unitPriceJt: 10 }]),
        kegiatan('K-19', 'Penghijauan & Kebersihan Lingkungan', '2 kegiatan penghijauan/kebersihan.', u.koordinator, PlanPriority.LOW, PlanStatus.DRAFT, [2, 11],
          q('Kegiatan penghijauan', 'kegiatan', [0, 1, 1, 2], 2, 1),
          [{ description: 'Bibit tanaman & sarana penghijauan', volume: 2, unit: 'kegiatan', unitPriceJt: 5 }], { start: '2027-02-01', end: '2027-11-30' }),
      ] },
    },
    {
      order: 3, perspective: BSCPerspective.PROCESS, priority: PlanPriority.HIGH, weight: 20, progress: 40,
      title: 'Bidang Kelembagaan & Tata Kelola (SS4 & SS5) — kepatuhan, audit & kemandirian',
      description: 'Prioritas 4 & 5 — K-20 s.d. K-23.',
      activities: { create: [
        kegiatan('K-20', 'Rapat Pembina, Laporan Tahunan & Perizinan', 'Laporan tahunan & Rapat Pembina tepat waktu; izin diperpanjang.', u.sekretaris, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Ketepatan pelaporan & perizinan', '%', [100, 100, 100, 100], 100, 100),
          [{ description: 'Penyelenggaraan Rapat Pembina & penggandaan laporan', volume: 1, unit: 'paket', unitPriceJt: 20 }, { description: 'Administrasi & legalisasi perizinan', volume: 1, unit: 'paket', unitPriceJt: 15 }]),
        kegiatan('K-21', 'Review Eksternal Laporan Keuangan & Sistem Akuntansi', 'Laporan keuangan 2026 direview eksternal; sistem akuntansi ditata.', u.bendahara, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Status laporan keuangan', 'skala 1-4', [1, 2, 2, 2], 2, 2),
          [{ description: 'Jasa review eksternal laporan keuangan', volume: 1, unit: 'paket', unitPriceJt: 25 }, { description: 'Penataan sistem & pelatihan akuntansi', volume: 1, unit: 'paket', unitPriceJt: 15 }]),
        kegiatan('K-22', 'Bimtek Manajemen Kepengurusan', '3 pelatihan manajemen kelembagaan & keuangan.', u.ketua, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, [2, 6, 10],
          q('Pelatihan pengurus', 'kali', [0, 1, 2, 3], 3, 1),
          [{ description: 'Pelatihan/bimtek manajemen kelembagaan & keuangan', volume: 3, unit: 'kali', unitPriceJt: 10 }], { start: '2027-02-01', end: '2027-10-31' }),
        kegiatan('K-23', 'BLK Bahasa, OPOP, Kopontren & Publikasi', 'BLK 20 peserta; OPOP terverifikasi; Kopontren aktif; website aktif.', u.koordinator, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Peserta kursus BLK', 'peserta', [0, 8, 14, 20], 20, 8),
          [{ description: 'Penataan & operasional BLK Bahasa', volume: 1, unit: 'paket', unitPriceJt: 45 }, { description: 'Pendaftaran OPOP & sertifikasi produk/halal', volume: 1, unit: 'paket', unitPriceJt: 25 }, { description: 'Penataan & modal kerja awal Kopontren', volume: 1, unit: 'paket', unitPriceJt: 40 }, { description: 'Website & publikasi kelembagaan', volume: 1, unit: 'paket', unitPriceJt: 10 }]),
      ] },
    },
    {
      order: 4, perspective: BSCPerspective.FINANCIAL, priority: PlanPriority.HIGH, weight: 10, progress: 58,
      title: 'Layanan Rutin Operasional & Personalia (lintas program)',
      description: 'Belanja personalia & operasional prasyarat seluruh Program — K-24.',
      activities: { create: [
        kegiatan('K-24', 'Layanan Rutin Operasional & Personalia Yayasan', 'Kewajiban rutin personalia & operasional terbayar tepat waktu 12 bulan.', u.bendahara, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
          q('Bulan terbayar tepat waktu', '%', [25, 50, 75, 100], 100, 58),
          [{ description: 'Bisyaroh/honor pendidik & tenaga kependidikan', volume: 12, unit: 'bulan', unitPriceJt: 55 }, { description: 'Utilitas (listrik, air, internet)', volume: 12, unit: 'bulan', unitPriceJt: 8 }, { description: 'ATK & kebutuhan rumah tangga kantor', volume: 12, unit: 'bulan', unitPriceJt: 4 }, { description: 'Konsumsi dapur santri/asrama', volume: 12, unit: 'bulan', unitPriceJt: 8 }, { description: 'Pemeliharaan ringan gedung & inventaris', volume: 1, unit: 'paket', unitPriceJt: 40 }]),
      ] },
    },
  ];

  const rka = await prisma.strategicPlan.create({
    data: {
      parent: { connect: { id: renstra.id } },
      type: PlanType.RKA,
      status: PlanStatus.IN_PROGRESS,
      title: 'RKA Yayasan Pesantren Cipansor 2027 (Tahun ke-1 Renstra)',
      description:
        'Rencana Kerja dan Anggaran tahun pertama Renstra 2027–2029. Setiap kegiatan ' +
        'memiliki induk Program, IKK triwulanan, jadwal bulanan, penanggung jawab, dan ' +
        'RAB rinci. Nominal indikatif (mock-up demo). Rantai: RPJP → Renstra → RKA Yayasan → RKA Unit.',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-12-31'),
      progress: 45,
      budget: D(rkaTotal),
      createdBy: { connect: { id: u.createdById } },
      approvedBy: { connect: { id: u.approvedById } },
      approvedAt: new Date('2027-01-10'),
      objectives: { create: rkaObjectives },
      fundingSources: {
        create: [
          { order: 0, name: 'Uang pendidikan (SPP/infaq bulanan, pendaftaran)', basis: 'Jumlah santri per unit × tarif × 12 bulan + pendaftaran PPDB (sesuai SK Pengurus & data riil).', amount: D(2100 * JT) },
          { order: 1, name: 'Dana BOSP (BOS Reguler SD, SMP, SMA)', basis: 'Satuan biaya per daerah (Permendikdasmen No. 8/2026) × siswa ber-NISN — indikatif, menunggu SK penyaluran.', amount: D(900 * JT) },
          { order: 2, name: 'Donasi & ZISWAF', basis: 'Target Renstra 2027 (indikatif).', amount: D(200 * JT) },
          { order: 3, name: 'Pendapatan unit usaha (BLK, Kopontren, OPOP)', basis: 'Rintisan; proyeksi konservatif hasil kursus & unit usaha.', amount: D(120 * JT) },
          { order: 4, name: 'Hibah/bantuan lain (Kemenag PRA, Pemda sarpras, OPOP)', basis: 'Dicatat hanya bila ada penetapan; tidak diandalkan sebagai penyeimbang.', amount: null },
          { order: 5, name: 'Penggunaan saldo awal tahun (bila diperlukan)', basis: 'Sesuai posisi kas awal 2027.', amount: D(485 * JT) },
        ],
      },
    },
  });

  // ───────────────────────────────────────────────────────────────────────
  // 4. Unit-level RKA excerpt — SMP IT's own 2027 slice (gives unit-scoped
  //    consumers a plan that lives on a real unit, alongside the cascade).
  // ───────────────────────────────────────────────────────────────────────
  // Build the SMP objectives first so `budget` can be the exact sum of the
  // unit's kegiatan RAB (kegiatan() accumulates into rkaTotal as it runs).
  const smpBase = rkaTotal;
  const smpObjectives: Prisma.PlanObjectiveCreateWithoutPlanInput[] = [
          {
            order: 0, perspective: BSCPerspective.CUSTOMER, priority: PlanPriority.HIGH, weight: 60, progress: 45,
            title: 'Mutu & akreditasi SMP IT',
            description: 'Persiapan kenaikan status akreditasi B → A dan pembinaan karakter remaja.',
            indicators: { create: [indicator({ name: 'Sesi pembinaan karakter remaja', unit: 'sesi', baseline: 0, targetValue: 3, currentValue: 1, level: PlanIndicatorLevel.IKK, targets: [{ period: 'TW I', targetValue: 1 }, { period: 'TW II', targetValue: 1 }, { period: 'TW III', targetValue: 2 }, { period: 'TW IV', targetValue: 3 }] })] },
            activities: { create: [
              kegiatan('K-08', 'Akreditasi & Pembinaan Remaja SMP IT', 'Berkas kenaikan status disiapkan; 3 sesi pembinaan remaja.', u.kepalaSmp, PlanPriority.HIGH, PlanStatus.IN_PROGRESS, ALL_MONTHS,
                q('Sesi pembinaan karakter remaja', 'sesi', [1, 1, 2, 3], 3, 1),
                [{ description: 'Pendampingan persiapan akreditasi', volume: 1, unit: 'paket', unitPriceJt: 15 }, { description: 'Sesi pembinaan karakter remaja', volume: 3, unit: 'kali', unitPriceJt: 3.3 }]),
            ] },
          },
          {
            order: 1, perspective: BSCPerspective.PROCESS, priority: PlanPriority.MEDIUM, weight: 40, progress: 35,
            title: 'Sarpras & akses SMP IT',
            description: 'Pengembangan laboratorium IPA & komputer dan penyaluran beasiswa dhuafa/yatim.',
            indicators: { create: [
              indicator({ name: 'Capaian standar laboratorium', unit: '%', baseline: 0, targetValue: 70, currentValue: 40, level: PlanIndicatorLevel.IKK }),
              indicator({ name: 'Penerima beasiswa SMP', unit: 'siswa', baseline: 0, targetValue: 7, currentValue: 7, level: PlanIndicatorLevel.IKK }),
            ] },
            activities: { create: [
              kegiatan('K-09', 'Laboratorium & Beasiswa SMP IT', 'Lab 70%; 7 beasiswa SMP.', u.kepalaSmp, PlanPriority.MEDIUM, PlanStatus.IN_PROGRESS, [1, 3, 4, 5, 6, 7, 8, 9, 10],
                q('Penerima beasiswa SMP', 'siswa', [7, 7, 7, 7], 7, 7),
                [{ description: 'Peralatan laboratorium IPA & komputer', volume: 1, unit: 'paket', unitPriceJt: 55 }, { description: 'Beasiswa siswa SMP dhuafa/yatim', volume: 7, unit: 'siswa', unitPriceJt: 5 }]),
            ] },
          },
  ];
  const smpBudget = rkaTotal - smpBase; // exact sum of the SMP kegiatan RAB

  const smpRka = await prisma.strategicPlan.create({
    data: {
      unit: { connect: { id: u.unitSmpId } },
      // The unit RKA hangs off the consolidated RKA Yayasan, not off the
      // Renstra — its description said so all along while the row pointed one
      // level too high.
      parent: { connect: { id: rka.id } },
      type: PlanType.RKA,
      status: PlanStatus.IN_PROGRESS,
      title: 'RKA SMP IT Pesantren Cipansor 2027',
      description:
        'RKA SMP IT tahun 2027 — turunan unit dari RKA Yayasan 2027, memuat kegiatan ' +
        'mutu/akreditasi dan sarpras yang dikelola Kepala SMP IT. Nominal indikatif.',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-12-31'),
      progress: 40,
      budget: D(smpBudget),
      createdBy: { connect: { id: u.createdById } },
      objectives: { create: smpObjectives },
    },
  });

  return { rpjp, renstra, rka, smpRka };
}
