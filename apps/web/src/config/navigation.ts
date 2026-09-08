import {
  LayoutDashboard,
  Users,
  Building2,
  Mail,
  GraduationCap,
  BookOpen,
  Calendar,
  ClipboardCheck,
  BookMarked,
  Home,
  FileText,
  AlertTriangle,
  Award,
  Wallet,
  UserPlus,
  Clock,
  Library,
  Heart,
  Package,
  Bell,
  BarChart3,
  School,
  Settings,
  FileSpreadsheet,
  Baby,
  Receipt,
  Megaphone,
  Shield,
  UserCog,
  UtensilsCrossed,
  IdCard,
  CalendarDays,
  Send,
  ScrollText,
  Drama,
  HeartHandshake,
  BookCheck,
  ClipboardList,
  MessageSquare,
  MessagesSquare,
  Languages,
  Sparkles,
  Trophy,
  WashingMachine,
  ShoppingCart,
  CreditCard,
  ClipboardPenLine,
  FolderOpen,
  FileBarChart,
  Activity,
  ShoppingBag,
  Key,
  MessageSquareWarning,
  Leaf,
  Globe,
  Mic,
  Microscope,
  FlaskConical,
  Briefcase,
  BookOpenCheck,
  NotebookPen,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles?: string[]; // Legacy role support
  roleCodes?: string[]; // New RoleCode-based permissions
  realms?: string[]; // Realm-based filtering
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Role codes by category for navigation permissions
const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "YAYASAN_KETUA",
  "TKQ_ADMIN",
  "TKQ_KEPALA_SEKOLAH",
  "SDIT_ADMIN",
  "SDIT_KEPALA_SEKOLAH",
  "SMPIT_ADMIN",
  "SMPIT_KEPALA_SEKOLAH",
  "SMAQ_ADMIN",
  "SMAQ_KEPALA_SEKOLAH",
];

const TEACHER_ROLES = [
  "TKQ_GURU",
  "SDIT_GURU",
  "SMPIT_GURU",
  "SMAQ_GURU",
  "TKQ_WAKASEK",
  "SDIT_WAKASEK",
  "SMPIT_WAKASEK",
  "SMAQ_WAKASEK",
  "TKQ_WALI_KELAS",
  "SDIT_WALI_KELAS",
  "SMPIT_WALI_KELAS",
  "SMAQ_WALI_KELAS",
  "SMPIT_GURU_BK",
  "SMAQ_GURU_BK",
];

const STAFF_ROLES = [
  "TKQ_TATA_USAHA",
  "SDIT_TATA_USAHA",
  "SMPIT_TATA_USAHA",
  "SMAQ_TATA_USAHA",
  "TKQ_BENDAHARA",
  "SDIT_BENDAHARA",
  "SMPIT_BENDAHARA",
  "SMAQ_BENDAHARA",
  "PESANTREN_TATA_USAHA",
  "PT_TATA_USAHA",
  "PT_STAF_AKADEMIK",
  "PUSTAKAWAN",
  "PERAWAT",
  "KEAMANAN",
  "LABORAN",
  "BUSINESS_MANAGER",
  "BUSINESS_STAFF",
];

// PT_MAHASISWA is a student too, but gets its own nav (ptMahasiswaNavigation)
// rather than the pesantren/school one, so it is deliberately not listed here.
const STUDENT_ROLES = ["SDIT_SISWA", "SMPIT_SISWA", "SMAQ_SISWA"];

const PARENT_ROLES = [
  "TKQ_ORANG_TUA",
  "SDIT_ORANG_TUA",
  "SMPIT_ORANG_TUA",
  "SMAQ_ORANG_TUA",
];

const YAYASAN_ROLES = [
  "YAYASAN_PEMBINA",
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
  "YAYASAN_BENDAHARA",
  "YAYASAN_ANGGOTA",
  "YAYASAN_PENGAWAS",
];

// Pesantren leadership vs. field pengasuhan staff — they get different menus.
const PESANTREN_PIMPINAN_ROLES = ["PESANTREN_PENGASUH", "PESANTREN_DIREKTUR"];

const PESANTREN_PENGASUHAN_ROLES = [
  "USTADZ",
  "MUSYRIF",
  "MUSYRIFAH",
  "MUHAFIDZ",
  "MUHAFIDZAH",
  "MURABBI",
  "WALI_KAMAR",
];

const PESANTREN_ROLES = [
  ...PESANTREN_PIMPINAN_ROLES,
  ...PESANTREN_PENGASUHAN_ROLES,
];

// Perguruan Tinggi. PT_TATA_USAHA and PT_STAF_AKADEMIK are staff (see
// STAFF_ROLES); PT_ALUMNI is covered by ALUMNI_ROLES.
const PT_PIMPINAN_ROLES = [
  "PT_REKTOR",
  "PT_WAKIL_REKTOR",
  "PT_DEKAN",
  "PT_KAPRODI",
];

// School committee — external oversight stakeholders, one per unit.
const KOMITE_ROLES = [
  "TKQ_KOMITE",
  "SDIT_KOMITE",
  "SMPIT_KOMITE",
  "SMAQ_KOMITE",
];

const ALUMNI_ROLES = [
  "SMPIT_ALUMNI",
  "SMAQ_ALUMNI",
  "PT_ALUMNI",
];

// Teacher-specific navigation
const teacherNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/teacher",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Mengajar",
    items: [
      {
        title: "Tahfidz",
        href: "/tahfidz",
        icon: BookMarked,
      },
      {
        title: "Kelas Saya",
        href: "/classes",
        icon: BookOpen,
      },
      {
        title: "Siswa",
        href: "/students",
        icon: GraduationCap,
      },
      {
        title: "Absensi",
        href: "/attendance",
        icon: ClipboardCheck,
      },
      {
        title: "Mutabaah Yaumiyah",
        href: "/daily-report",
        icon: Activity,
      },
      {
        title: "Portfolio Siswa",
        href: "/portfolio",
        icon: FolderOpen,
      },
    ],
  },
  {
    title: "Wali Kelas",
    items: [
      {
        title: "Dashboard Wali Kelas",
        href: "/homeroom",
        icon: Home,
      },
      {
        title: "Absensi Harian",
        href: "/homeroom/attendance",
        icon: ClipboardCheck,
      },
      {
        title: "Catatan Perilaku",
        href: "/homeroom/behavior",
        icon: ClipboardList,
      },
      {
        title: "Pesan Orang Tua",
        href: "/homeroom/messages",
        icon: Send,
      },
    ],
  },
  {
    title: "Pesantren",
    items: [
      {
        title: "Jurnal Ibadah",
        href: "/ibadah",
        icon: Sparkles,
      },
      {
        title: "Muhadhoroh",
        href: "/muhadhoroh",
        icon: MessageSquare,
      },
      {
        title: "Muhadatsah",
        href: "/muhadatsah",
        icon: Languages,
      },
      {
        title: "Kitab Kuning",
        href: "/kitab-progress",
        icon: BookOpen,
      },
    ],
  },
  {
    title: "PKG",
    items: [
      {
        title: "Penilaian Kinerja",
        href: "/pkg",
        icon: ClipboardPenLine,
      },
    ],
  },
  {
    title: "Informasi",
    items: [
      {
        title: "E-Office (Persuratan)",
        href: "/e-office",
        icon: Mail,
      },
      {
        title: "Pengumuman",
        href: "/announcements",
        icon: Bell,
      },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Staff-specific navigation
const staffNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/staff",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Layanan Siswa",
    items: [
      {
        title: "Data Siswa",
        href: "/students",
        icon: GraduationCap,
      },
      {
        title: "Kesehatan",
        href: "/health",
        icon: Heart,
      },
      {
        title: "Perizinan",
        href: "/permits",
        icon: FileText,
      },
      {
        title: "Pelanggaran",
        href: "/violations",
        icon: AlertTriangle,
      },
      {
        title: "Penghargaan",
        href: "/rewards",
        icon: Award,
      },
      {
        title: "Kampus Hijau",
        href: "/lingkungan",
        icon: Leaf,
      },
    ],
  },
  {
    title: "Administrasi",
    items: [
      {
        title: "E-Office (Persuratan)",
        href: "/e-office",
        icon: Mail,
      },
      {
        title: "Keuangan",
        href: "/finance",
        icon: Wallet,
      },
      {
        title: "Pengumuman",
        href: "/announcements",
        icon: Bell,
      },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Student-specific navigation
const studentNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/student",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Hafalan",
    items: [
      {
        title: "Hafalan Saya",
        href: "/tahfidz",
        icon: BookMarked,
      },
    ],
  },
  {
    title: "Akademik",
    items: [
      {
        title: "Ujian Online",
        href: "/student/exams",
        icon: BookCheck,
      },
      {
        title: "Portfolio Saya",
        href: "/portfolio",
        icon: FolderOpen,
      },
    ],
  },
  {
    title: "Pesantren",
    items: [
      {
        title: "Jurnal Ibadah",
        href: "/ibadah",
        icon: Sparkles,
      },
      {
        title: "Prestasi Ibadah",
        href: "/student/achievements",
        icon: Trophy,
      },
      {
        title: "Muhadhoroh",
        href: "/muhadhoroh",
        icon: MessageSquare,
      },
      {
        title: "Muhadatsah",
        href: "/muhadatsah",
        icon: Languages,
      },
      {
        title: "Kitab Kuning",
        href: "/kitab-progress",
        icon: BookOpen,
      },
      {
        title: "Muhasabah Harian",
        href: "/muhasabah",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "Kegiatan",
    items: [
      {
        title: "Jadwal",
        href: "/schedule",
        icon: Calendar,
      },
      {
        title: "Pengumuman",
        href: "/announcements",
        icon: Bell,
      },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Parent-specific navigation
const parentNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/parent",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Anak Saya",
    items: [
      {
        title: "Data Anak",
        href: "/parent/children",
        icon: Baby,
      },
      {
        title: "Raport",
        href: "/parent/report-cards",
        icon: FileSpreadsheet,
      },
      {
        title: "Kesehatan",
        href: "/parent/health",
        icon: Heart,
      },
      {
        title: "Perizinan",
        href: "/parent/permits",
        icon: FileText,
      },
      {
        title: "Laporan Harian",
        href: "/parent/daily-report",
        icon: Activity,
      },
    ],
  },
  {
    title: "Kesiswaan",
    items: [
      {
        title: "Pelanggaran",
        href: "/parent/violations",
        icon: AlertTriangle,
      },
      {
        title: "Penghargaan",
        href: "/parent/rewards",
        icon: Award,
      },
      {
        title: "Ibadah",
        href: "/parent/ibadah",
        icon: BookOpenCheck,
      },
      {
        title: "Konseling",
        href: "/parent/counseling",
        icon: HeartHandshake,
      },
    ],
  },
  {
    title: "Keuangan",
    items: [
      {
        title: "Tagihan & Pembayaran",
        href: "/parent/finance",
        icon: Receipt,
      },
    ],
  },
  {
    title: "Komunikasi",
    items: [
      {
        title: "Buku Penghubung",
        href: "/parent/buku-penghubung",
        icon: NotebookPen,
      },
      {
        title: "Pesan",
        href: "/parent/messages",
        icon: MessageSquare,
      },
      {
        title: "Pengaturan Notifikasi",
        href: "/parent/notifications/preferences",
        icon: Bell,
      },
    ],
  },
  {
    title: "Informasi",
    items: [
      {
        title: "Pengumuman",
        href: "/parent/announcements",
        icon: Megaphone,
      },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Yayasan-specific navigation (for Yayasan admins and board members)
const yayasanNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
      {
        title: "Reports",
        href: "/reports",
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    title: "Yayasan",
    items: [
      {
        title: "Foundation",
        href: "/foundation",
        icon: Building2,
      },
      {
        title: "E-Office (Persuratan)",
        href: "/e-office",
        icon: Mail,
      },
      {
        title: "Units",
        href: "/units",
        icon: School,
      },
      {
        title: "Penjaminan Mutu",
        href: "/quality",
        icon: Award,
      },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
  {
    title: "Keuangan",
    items: [
      // "Laporan Keuangan" used to point here, at /finance — a santri billing
      // dashboard, not a financial report. The actual financial statements
      // (neraca, laba rugi, arus kas) live at /finance/accounting and were
      // filed under Administration, so nobody looking for a laporan keuangan
      // in the Keuangan menu could find one. /finance/billing was a second,
      // overlapping tagihan screen that reported a different outstanding total
      // than /finance did; it is now the Tunggakan tab of this page.
      {
        title: "Tagihan & SPP",
        href: "/finance",
        icon: Receipt,
      },
      {
        title: "Verifikasi Pembayaran",
        href: "/finance/verification",
        icon: Receipt,
      },
      {
        title: "Laporan Keuangan",
        href: "/finance/accounting",
        icon: Wallet,
      },
      {
        title: "BOS/BOP",
        href: "/finance/bos",
        icon: Wallet,
      },
      {
        title: "Procurement",
        href: "/procurement",
        icon: ShoppingBag,
      },
      {
        title: "Donation/ZIS",
        href: "/donation",
        icon: HeartHandshake,
      },
      {
        title: "Public Portal",
        href: "/wakaf-infaq",
        icon: HeartHandshake,
      },
    ],
  },
  {
    title: "Alumni",
    items: [
      {
        title: "Data Alumni",
        href: "/alumni",
        icon: GraduationCap,
      },
    ],
  },
  {
    title: "Risk Management",
    items: [
      {
        title: "Manajemen Risiko",
        href: "/risk-management",
        icon: Shield,
      },
    ],
  },
  {
    title: "Pengumuman",
    items: [
      {
        title: "Pengumuman",
        href: "/announcements",
        icon: Megaphone,
      },
    ],
  },
];

// Admin navigation - for Super Admin and Unit Admins
const adminNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
      {
        title: "Reports",
        href: "/reports",
        icon: FileSpreadsheet,
      },
      {
        title: "EMIS Kemenag",
        href: "/emis",
        icon: FileSpreadsheet,
        roleCodes: [
          "SUPER_ADMIN",
          "TKQ_ADMIN",
          "SDIT_ADMIN",
          "SMPIT_ADMIN",
          "SMAQ_ADMIN",
        ],
      },
    ],
  },
  {
    title: "Marketing",
    items: [
      {
        title: "Dashboard",
        href: "/marketing",
        icon: BarChart3,
      },
      {
        title: "Campaigns",
        href: "/marketing/campaigns",
        icon: Megaphone,
      },
      {
        title: "Leads",
        href: "/marketing/leads",
        icon: Users,
      },
      {
        title: "Analitik Marketing",
        href: "/admin/marketing",
        icon: BarChart3,
        roleCodes: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        title: "Foundation",
        href: "/foundation",
        icon: Building2,
        roleCodes: ["SUPER_ADMIN"],
      },
      {
        title: "Units",
        href: "/units",
        icon: School,
        roleCodes: ["SUPER_ADMIN"],
      },
      {
        title: "Users & Roles",
        href: "/users",
        icon: UserCog,
      },
      {
        title: "Role Permissions",
        href: "/settings/roles",
        icon: Shield,
        roleCodes: ["SUPER_ADMIN"],
      },
      {
        title: "Kesiapan Akreditasi",
        href: "/foundation/accreditation/readiness",
        icon: Award,
        roleCodes: ["SUPER_ADMIN"],
      },
      {
        title: "Konsolidasi Keuangan",
        href: "/foundation/finance/consolidation",
        icon: FileSpreadsheet,
        roleCodes: ["SUPER_ADMIN"],
      },
      {
        title: "Unit Usaha",
        href: "/unit-usaha",
        icon: Briefcase,
      },
      {
        title: "Projects",
        href: "/project",
        icon: FolderOpen,
      },
    ],
  },
  {
    title: "Academic",
    items: [
      {
        title: "Students",
        href: "/students",
        icon: GraduationCap,
      },
      {
        title: "Student ID Card",
        href: "/students/id-card",
        icon: IdCard,
      },
      {
        title: "Certificates",
        href: "/students/certificates",
        icon: Award,
      },
      {
        title: "Transcript",
        href: "/students/transcript",
        icon: ScrollText,
      },
      {
        title: "Portfolio Siswa",
        href: "/portfolio",
        icon: FolderOpen,
      },
      {
        title: "Classes",
        href: "/classes",
        icon: BookOpen,
      },
      {
        title: "Academic Years",
        href: "/academic-years",
        icon: Calendar,
      },
      {
        title: "Curriculum",
        href: "/curriculum",
        icon: BookMarked,
      },
      {
        title: "Timetable",
        href: "/curriculum/schedules/timetable",
        icon: CalendarDays,
      },
      {
        title: "Assessment",
        href: "/assessment",
        icon: ClipboardCheck,
      },
      {
        title: "Question Banks (CBT)",
        href: "/cbt/banks",
        icon: BookCheck,
      },
      {
        title: "Raport Merdeka",
        href: "/assessment/raport-merdeka",
        icon: FileSpreadsheet,
      },
      {
        title: "Mutabaah Yaumiyah",
        href: "/daily-report",
        icon: Activity,
        roleCodes: [
          "TKQ_ADMIN",
          "SDIT_ADMIN",
          "TKQ_KEPALA_SEKOLAH",
          "SDIT_KEPALA_SEKOLAH",
        ],
      },
      {
        title: "Attendance",
        href: "/attendance",
        icon: ClipboardCheck,
      },
      {
        title: "Attendance Calendar",
        href: "/attendance/calendar",
        icon: CalendarDays,
      },
      {
        title: "Academic Calendar",
        href: "/calendar",
        icon: CalendarDays,
      },
      {
        title: "Tahfidz",
        href: "/tahfidz",
        icon: BookMarked,
      },
      {
        title: "E-Simaan",
        href: "/tahfidz/e-simaan",
        icon: Mic,
      },
      {
        title: "Peta Al-Quran",
        href: "/tahfidz/quran-map",
        icon: BookCheck,
      },
      {
        title: "Analitik Murojaah",
        href: "/tahfidz/murojaah/analytics",
        icon: BarChart3,
      },
      {
        title: "Jadwal Simaan",
        href: "/tahfidz/simaan/schedule",
        icon: CalendarDays,
      },
      {
        title: "Jadwal Ujian (CBT)",
        href: "/cbt/exams",
        icon: BookOpenCheck,
      },
    ],
  },
  {
    // The whole TK/PAUD module (assessment, daily reports, raport) shipped
    // without a single menu entry, so no role could reach any of its pages.
    title: "TK / PAUD",
    items: [
      {
        title: "Dashboard TK",
        href: "/tk",
        icon: Baby,
      },
      {
        title: "Penilaian TK",
        href: "/tk/assessment",
        icon: ClipboardPenLine,
      },
      {
        title: "Progres Penilaian",
        href: "/tk/assessment/progress",
        icon: BarChart3,
      },
      {
        title: "Laporan Harian",
        href: "/tk/daily-reports",
        icon: NotebookPen,
      },
      {
        title: "Laporan Harian (Kelas)",
        href: "/tk/daily-reports/class",
        icon: School,
      },
      {
        title: "Laporan Harian (Orang Tua)",
        href: "/tk/daily-reports/parent",
        icon: Heart,
      },
      {
        title: "Raport TK",
        href: "/tk/reports",
        icon: FileBarChart,
      },
    ],
  },
  {
    title: "Kesiswaan",
    items: [
      {
        title: "Ekstrakurikuler",
        href: "/extracurricular",
        icon: Drama,
      },
      {
        title: "Bimbingan Konseling",
        href: "/counseling",
        icon: HeartHandshake,
      },
      {
        title: "Piket Santri",
        href: "/duty-roster",
        icon: ClipboardList,
      },
    ],
  },
  {
    title: "Pesantren",
    items: [
      {
        title: "Jurnal Ibadah",
        href: "/ibadah",
        icon: Sparkles,
      },
      {
        title: "Muhadhoroh",
        href: "/muhadhoroh",
        icon: MessageSquare,
      },
      {
        title: "Muhadatsah",
        href: "/muhadatsah",
        icon: Languages,
      },
      {
        title: "Kitab Kuning",
        href: "/kitab-progress",
        icon: BookOpen,
      },
      {
        title: "Amaliyah Tadris",
        href: "/practicum",
        icon: ClipboardPenLine,
      },
      {
        title: "Qiyadah (Organisasi)",
        href: "/student-org",
        icon: Users,
      },
      {
        title: "Turats Lab",
        href: "/research",
        icon: ScrollText,
      },
      {
        title: "Takhosus",
        href: "/takhosus",
        icon: BookMarked,
      },
      {
        title: "Muhasabah",
        href: "/muhasabah",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "Boarding",
    items: [
      {
        title: "Dormitories",
        href: "/dormitories",
        icon: Home,
      },
      {
        title: "Permits",
        href: "/permits",
        icon: FileText,
      },
      {
        title: "Violations",
        href: "/violations",
        icon: AlertTriangle,
      },
      {
        title: "Rewards",
        href: "/rewards",
        icon: Award,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        title: "Tagihan & SPP",
        href: "/finance",
        icon: Receipt,
      },
      {
        title: "Laporan Keuangan",
        href: "/finance/accounting",
        icon: Wallet,
      },
      {
        title: "BOS/BOP",
        href: "/finance/bos",
        icon: Wallet,
      },
      {
        title: "Procurement",
        href: "/procurement",
        icon: ShoppingBag,
      },
      {
        title: "Scholarships",
        href: "/finance/scholarships",
        icon: Award,
      },
      {
        title: "Donation/ZIS",
        href: "/donation",
        icon: HeartHandshake,
      },
      {
        title: "Admissions",
        href: "/admissions",
        icon: UserPlus,
      },
      {
        title: "HR",
        href: "/hr",
        icon: Clock,
      },
      {
        title: "Staff Attendance",
        href: "/hr/attendance",
        icon: ClipboardCheck,
      },
      {
        title: "Penggajian",
        href: "/payroll",
        icon: Wallet,
      },
      {
        title: "Komponen Gaji",
        href: "/hr/payroll/components",
        icon: CreditCard,
      },
      {
        title: "Periode Penggajian",
        href: "/hr/payroll/periods",
        icon: CalendarDays,
      },
      {
        title: "Gaji Pegawai",
        href: "/hr/payroll/staff-salary",
        icon: Wallet,
      },
      {
        title: "Manajemen Talenta",
        href: "/talenta",
        icon: Sparkles,
      },
      {
        // Hub for neraca / laba rugi / arus kas / buku besar / neraca saldo.
        // Those six report pages had no menu path of their own.
        title: "Laporan Akuntansi",
        href: "/finance/reports",
        icon: FileBarChart,
      },
      {
        title: "PKG Guru",
        href: "/pkg",
        icon: ClipboardPenLine,
      },
      {
        title: "Penjaminan Mutu",
        href: "/quality",
        icon: Award,
      },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Facilities",
        href: "/facilities",
        icon: Building2,
      },
      {
        title: "E-Office (Persuratan)",
        href: "/e-office",
        icon: Mail,
      },
      {
        title: "Inventory (Asset)",
        href: "/inventory",
        icon: Package,
      },
      {
        title: "Library",
        href: "/library",
        icon: Library,
      },
      {
        title: "Maktabah Digital",
        href: "/library/digital",
        icon: BookOpen,
      },
      {
        title: "Health (UKS)",
        href: "/health",
        icon: Heart,
      },
      {
        title: "Meals",
        href: "/meals",
        icon: UtensilsCrossed,
      },
      {
        title: "Canteen/Koperasi",
        href: "/canteen",
        icon: ShoppingCart,
      },
      {
        title: "Laundry",
        href: "/laundry",
        icon: WashingMachine,
      },
      {
        title: "Reception",
        href: "/reception",
        icon: IdCard,
      },
      {
        title: "Dompet Santri",
        href: "/finance/wallet",
        icon: CreditCard,
      },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
      },
      {
        title: "Quick Send",
        href: "/notifications/quick-send",
        icon: Send,
      },
    ],
  },
  {
    title: "Reference Data",
    items: [
      {
        title: "Wilayah",
        href: "/wilayah",
        icon: Building2,
        roleCodes: ["SUPER_ADMIN"],
      },
      {
        title: "Kurikulum Merdeka",
        href: "/curriculum/merdeka",
        icon: BookMarked,
      },
    ],
  },
  {
    title: "Compliance",
    items: [
      {
        title: "Student Compliance",
        href: "/students/compliance",
        icon: Shield,
      },
      {
        title: "Teacher Compliance",
        href: "/hr/teachers/compliance",
        icon: Shield,
      },
    ],
  },
  {
    // The governance cluster used to hold Manajemen Risiko alone, so the pages
    // it integrates with — Perencanaan (RPJP/Renstra/RKA), the GRC dashboard,
    // Pengawasan, Kepatuhan Syariah and Tata Laksana — shipped with no menu
    // entry at all and were reachable only by typing the URL.
    title: "Perencanaan & Tata Kelola",
    items: [
      {
        title: "Perencanaan Strategis",
        href: "/perencanaan",
        icon: ClipboardList,
      },
      {
        title: "Peta Strategi",
        href: "/perencanaan/strategy-map",
        icon: Globe,
      },
      {
        title: "Manajemen Risiko",
        href: "/risk-management",
        icon: Shield,
      },
      {
        title: "Dashboard GRC",
        href: "/grc-dashboard",
        icon: ShieldCheck,
      },
      {
        title: "Pengawasan Internal",
        href: "/pengawasan",
        icon: ClipboardCheck,
      },
      {
        title: "Kepatuhan Syariah",
        href: "/syariah",
        icon: BookCheck,
      },
      {
        title: "Tata Laksana (SOP)",
        href: "/tata-laksana",
        icon: ScrollText,
      },
      {
        title: "Struktur Organisasi",
        href: "/organisasi",
        icon: UserCog,
      },
    ],
  },
  {
    title: "Alumni",
    items: [
      {
        title: "Alumni",
        href: "/alumni",
        icon: GraduationCap,
      },
      {
        title: "Si-Taka (Sebaran)",
        href: "/alumni/placement",
        icon: Globe,
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
      {
        /**
         * The approval queue for electronic-signature keys.
         *
         * It had no entry here at all, and `/settings/esign` appeared nowhere
         * in the codebase but its own page file — so the only way to reach it
         * was to type the URL. The effect was a dead end for the whole
         * feature: a signer requests a key, nobody ever sees the request, no
         * key is ever issued, and no letter can be signed.
         */
        title: "Tanda Tangan Elektronik",
        href: "/settings/esign",
        icon: ShieldCheck,
        roleCodes: ["SUPER_ADMIN"],
        roles: ["SUPER_ADMIN"],
      },
      {
        title: "Secrets",
        href: "/dashboard/settings/system-secrets",
        icon: Key,
        roleCodes: ["SUPER_ADMIN"],
        roles: ["SUPER_ADMIN"], // Explicitly support legacy role
      },
      {
        // The editable persona (tone/style) of the public chatbot. Safety rules
        // are code-resident; this only controls how the assistant speaks.
        title: "Asisten AI",
        href: "/settings/chatbot",
        icon: MessageSquare,
        roleCodes: ["SUPER_ADMIN"],
        roles: ["SUPER_ADMIN"],
      },
      {
        // Riwayat tanya-jawab asisten publik. Dikunci ke SUPER_ADMIN dengan
        // alasan yang lebih keras daripada persona di atasnya: isinya kalimat
        // yang benar-benar diketik pengunjung, dan terhapus sendiri setelah 90
        // hari.
        title: "Riwayat Percakapan",
        href: "/settings/chatbot/percakapan",
        icon: MessagesSquare,
        roleCodes: ["SUPER_ADMIN"],
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
];

// Kepala Sekolah navigation - extended admin with focus on school operations
const kepalaSekolahNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
      {
        title: "Reports",
        href: "/reports",
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        title: "Users & Staff",
        href: "/users",
        icon: UserCog,
      },
      {
        title: "Teachers",
        href: "/hr/employees",
        icon: Users,
      },
      {
        title: "PKG Guru",
        href: "/pkg",
        icon: ClipboardPenLine,
      },
    ],
  },
  {
    title: "Academic",
    items: [
      {
        title: "Students",
        href: "/students",
        icon: GraduationCap,
      },
      {
        title: "Portfolio Siswa",
        href: "/portfolio",
        icon: FolderOpen,
      },
      {
        title: "Classes",
        href: "/classes",
        icon: BookOpen,
      },
      {
        title: "Curriculum",
        href: "/curriculum",
        icon: BookMarked,
      },
      {
        title: "Assessment",
        href: "/assessment",
        icon: ClipboardCheck,
      },
      {
        title: "Tahfidz",
        href: "/tahfidz",
        icon: BookMarked,
      },
    ],
  },
  {
    title: "Kesiswaan",
    items: [
      {
        title: "Attendance",
        href: "/attendance",
        icon: ClipboardCheck,
      },
      {
        title: "Permits",
        href: "/permits",
        icon: FileText,
      },
      {
        title: "Violations",
        href: "/violations",
        icon: AlertTriangle,
      },
      {
        title: "Rewards",
        href: "/rewards",
        icon: Award,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        title: "Admissions",
        href: "/admissions",
        icon: UserPlus,
      },
      {
        title: "HR",
        href: "/hr",
        icon: Clock,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "E-Office (Persuratan)",
        href: "/e-office",
        icon: Mail,
      },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
      },
      {
        title: "Announcements",
        href: "/announcements",
        icon: Megaphone,
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

// Pesantren leadership (Pengasuh, Direktur) — oversight across pengasuhan,
// tahfidz/diniyah, boarding services and reporting.
const pesantrenPimpinanNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/teacher", icon: LayoutDashboard },
      { title: "Analitik", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Santri & Pengasuhan",
    items: [
      { title: "Data Santri", href: "/students", icon: GraduationCap },
      { title: "Musyrif & Halaqoh", href: "/musyrif", icon: UserCog },
      { title: "Asrama", href: "/dormitories", icon: Home },
      { title: "Perizinan", href: "/permits", icon: ScrollText },
      { title: "Pelanggaran", href: "/violations", icon: AlertTriangle },
      { title: "Prestasi & Reward", href: "/rewards", icon: Trophy },
    ],
  },
  {
    title: "Tahfidz & Diniyah",
    items: [
      { title: "Tahfidz", href: "/tahfidz", icon: BookMarked },
      { title: "Takhosus", href: "/takhosus", icon: BookCheck },
      { title: "Kitab Kuning", href: "/kitab-progress", icon: BookOpen },
      { title: "Jurnal Ibadah", href: "/ibadah", icon: Sparkles },
      { title: "Muhadhoroh", href: "/muhadhoroh", icon: Mic },
      { title: "Muhadatsah", href: "/muhadatsah", icon: Languages },
    ],
  },
  {
    title: "Kesantrian",
    items: [
      { title: "Muhasabah", href: "/muhasabah", icon: ClipboardPenLine },
      { title: "Konseling", href: "/counseling", icon: HeartHandshake },
      { title: "Kesehatan", href: "/health", icon: Heart },
      { title: "Piket & Jaga", href: "/duty-roster", icon: Clock },
    ],
  },
  {
    title: "Layanan Asrama",
    items: [
      { title: "Dapur & Konsumsi", href: "/meals", icon: UtensilsCrossed },
      { title: "Laundry", href: "/laundry", icon: WashingMachine },
      { title: "Kantin", href: "/canteen", icon: ShoppingCart },
    ],
  },
  {
    title: "Laporan",
    items: [
      {
        title: "Rapor Pesantren",
        href: "/rapor-pesantren",
        icon: FileSpreadsheet,
      },
      { title: "Laporan", href: "/reports", icon: FileBarChart },
    ],
  },
  {
    title: "Informasi",
    items: [
      { title: "E-Office (Persuratan)", href: "/e-office", icon: Mail },
      { title: "Pengumuman", href: "/announcements", icon: Bell },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Pesantren field staff (Ustadz, Musyrif/ah, Muhafidz/ah, Murabbi, Wali Kamar)
// — day-to-day pengasuhan of the santri they are responsible for.
const pesantrenPengasuhanNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [{ title: "Dashboard", href: "/teacher", icon: LayoutDashboard }],
  },
  {
    title: "Halaqoh & Tahfidz",
    items: [
      { title: "Tahfidz", href: "/tahfidz", icon: BookMarked },
      { title: "Takhosus", href: "/takhosus", icon: BookCheck },
      { title: "Kitab Kuning", href: "/kitab-progress", icon: BookOpen },
    ],
  },
  {
    title: "Pengasuhan",
    items: [
      { title: "Santri Binaan", href: "/students", icon: GraduationCap },
      { title: "Asrama", href: "/dormitories", icon: Home },
      { title: "Musyrif", href: "/musyrif", icon: UserCog },
      { title: "Mutabaah Yaumiyah", href: "/daily-report", icon: Activity },
      { title: "Jurnal Ibadah", href: "/ibadah", icon: Sparkles },
      { title: "Muhasabah", href: "/muhasabah", icon: ClipboardPenLine },
    ],
  },
  {
    title: "Kedisiplinan",
    items: [
      { title: "Perizinan", href: "/permits", icon: ScrollText },
      { title: "Pelanggaran", href: "/violations", icon: AlertTriangle },
      { title: "Prestasi & Reward", href: "/rewards", icon: Trophy },
      { title: "Piket & Jaga", href: "/duty-roster", icon: Clock },
    ],
  },
  {
    title: "Kegiatan",
    items: [
      { title: "Muhadhoroh", href: "/muhadhoroh", icon: Mic },
      { title: "Muhadatsah", href: "/muhadatsah", icon: Languages },
      { title: "Jadwal", href: "/schedule", icon: Calendar },
    ],
  },
  {
    title: "Layanan",
    items: [
      { title: "Kesehatan", href: "/health", icon: Heart },
      { title: "Laundry", href: "/laundry", icon: WashingMachine },
      { title: "Konsumsi", href: "/meals", icon: UtensilsCrossed },
    ],
  },
  {
    title: "Laporan",
    items: [
      {
        title: "Rapor Pesantren",
        href: "/rapor-pesantren",
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    title: "Informasi",
    items: [
      { title: "E-Office (Persuratan)", href: "/e-office", icon: Mail },
      { title: "Pengumuman", href: "/announcements", icon: Bell },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Perguruan Tinggi leadership (Rektor, Wakil Rektor, Dekan, Kaprodi).
const ptPimpinanNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/teacher", icon: LayoutDashboard },
      { title: "Analitik", href: "/analytics", icon: BarChart3 },
      { title: "Laporan", href: "/reports", icon: FileBarChart },
    ],
  },
  {
    title: "Akademik",
    items: [
      { title: "Kurikulum", href: "/curriculum", icon: BookOpen },
      { title: "Kelas & Mata Kuliah", href: "/classes", icon: School },
      { title: "Jadwal Kuliah", href: "/schedule", icon: Calendar },
      { title: "Penilaian", href: "/assessment", icon: ClipboardList },
      { title: "Presensi", href: "/attendance", icon: ClipboardCheck },
    ],
  },
  {
    title: "Kemahasiswaan",
    items: [
      { title: "Data Mahasiswa", href: "/students", icon: GraduationCap },
      { title: "Organisasi Mahasiswa", href: "/student-org", icon: Users },
      { title: "UKM & Ekstrakurikuler", href: "/extracurricular", icon: Drama },
      { title: "Konseling", href: "/counseling", icon: HeartHandshake },
    ],
  },
  {
    title: "Penelitian & Pengabdian",
    items: [
      { title: "Penelitian", href: "/research", icon: Microscope },
      { title: "Litbang", href: "/litbang", icon: FileBarChart },
      { title: "Praktikum", href: "/practicum", icon: FlaskConical },
      { title: "Perpustakaan", href: "/library", icon: Library },
    ],
  },
  {
    title: "Alumni & Sertifikasi",
    items: [
      { title: "Direktori Alumni", href: "/alumni", icon: Users },
      { title: "Penempatan Karier", href: "/alumni/placement", icon: Briefcase },
      { title: "Sertifikat", href: "/certificates", icon: Award },
    ],
  },
  {
    title: "Mutu",
    items: [
      { title: "Penjaminan Mutu", href: "/quality", icon: Shield },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
  {
    title: "Informasi",
    items: [
      { title: "E-Office (Persuratan)", href: "/e-office", icon: Mail },
      { title: "Pengumuman", href: "/announcements", icon: Bell },
    ],
  },
];

// Perguruan Tinggi lecturers.
const ptDosenNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [{ title: "Dashboard", href: "/teacher", icon: LayoutDashboard }],
  },
  {
    title: "Mengajar",
    items: [
      { title: "Kelas & Mata Kuliah", href: "/classes", icon: School },
      { title: "Jadwal Kuliah", href: "/schedule", icon: Calendar },
      { title: "Presensi", href: "/attendance", icon: ClipboardCheck },
      { title: "Tugas", href: "/assignments", icon: FileText },
      { title: "Penilaian", href: "/assessment", icon: ClipboardList },
      { title: "Mahasiswa", href: "/students", icon: GraduationCap },
    ],
  },
  {
    title: "Penelitian",
    items: [
      { title: "Penelitian", href: "/research", icon: Microscope },
      { title: "Praktikum", href: "/practicum", icon: FlaskConical },
      { title: "Perpustakaan", href: "/library", icon: Library },
    ],
  },
  {
    title: "Bimbingan",
    items: [
      { title: "Konseling", href: "/counseling", icon: HeartHandshake },
      { title: "Portfolio Mahasiswa", href: "/portfolio", icon: FolderOpen },
    ],
  },
  {
    title: "Kinerja",
    items: [
      { title: "Penilaian Kinerja", href: "/pkg", icon: ClipboardPenLine },
    ],
  },
  {
    title: "Informasi",
    items: [
      { title: "E-Office (Persuratan)", href: "/e-office", icon: Mail },
      { title: "Pengumuman", href: "/announcements", icon: Bell },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Perguruan Tinggi students — distinct from the pesantren/school student nav
// (no tahfidz/pesantren groups, adds UKM, praktikum and billing).
const ptMahasiswaNavigation: NavGroup[] = [
  {
    title: "Overview",
    items: [{ title: "Dashboard", href: "/student", icon: LayoutDashboard }],
  },
  {
    title: "Akademik",
    items: [
      { title: "Jadwal Kuliah", href: "/schedule", icon: Calendar },
      { title: "Kelas & Mata Kuliah", href: "/classes", icon: School },
      { title: "Tugas", href: "/assignments", icon: FileText },
      { title: "Nilai", href: "/assessment", icon: ClipboardList },
      { title: "Presensi", href: "/attendance", icon: ClipboardCheck },
      { title: "Portfolio Saya", href: "/portfolio", icon: FolderOpen },
    ],
  },
  {
    title: "Kemahasiswaan",
    items: [
      { title: "Organisasi Mahasiswa", href: "/student-org", icon: Users },
      { title: "UKM & Ekstrakurikuler", href: "/extracurricular", icon: Drama },
      { title: "Praktikum", href: "/practicum", icon: FlaskConical },
      { title: "Konseling", href: "/counseling", icon: HeartHandshake },
    ],
  },
  {
    title: "Sumber Daya",
    items: [
      { title: "Perpustakaan", href: "/library", icon: Library },
      { title: "Penelitian", href: "/research", icon: Microscope },
    ],
  },
  {
    title: "Keuangan",
    items: [{ title: "Dompet Digital", href: "/wallet", icon: Wallet }],
  },
  {
    title: "Informasi",
    items: [
      { title: "Pengumuman", href: "/announcements", icon: Bell },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
];

// Komite Sekolah — external stakeholders. Oversight and transparency only,
// no operational data entry.
const komiteNavigation: NavGroup[] = [
  {
    title: "Pengawasan",
    items: [
      { title: "Laporan Sekolah", href: "/reports", icon: FileBarChart },
      { title: "Analitik", href: "/analytics", icon: BarChart3 },
      { title: "Penjaminan Mutu", href: "/quality", icon: Shield },
    ],
  },
  {
    title: "Keuangan",
    items: [
      { title: "Tagihan & SPP", href: "/finance", icon: Receipt },
      { title: "Donasi & Wakaf", href: "/donation", icon: HeartHandshake },
    ],
  },
  {
    title: "Kesiswaan",
    items: [
      { title: "Data Siswa", href: "/students", icon: GraduationCap },
      { title: "Prestasi Siswa", href: "/rewards", icon: Trophy },
    ],
  },
  {
    title: "Partisipasi",
    items: [
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
      { title: "Pengumuman", href: "/announcements", icon: Bell },
      { title: "Agenda Kegiatan", href: "/schedule", icon: Calendar },
    ],
  },
];

// Alumni across every unit (school, pesantren and PT).
const alumniNavigation: NavGroup[] = [
  {
    title: "Alumni",
    items: [
      { title: "Direktori Alumni", href: "/alumni", icon: Users },
      { title: "Penempatan Karier", href: "/alumni/placement", icon: Briefcase },
      { title: "Sanad Keilmuan", href: "/alumni/sanad", icon: ScrollText },
    ],
  },
  {
    title: "Dokumen Saya",
    items: [
      { title: "Sertifikat", href: "/certificates", icon: Award },
      { title: "Portfolio", href: "/portfolio", icon: FolderOpen },
    ],
  },
  {
    title: "Kontribusi",
    items: [
      { title: "Donasi & Wakaf", href: "/donation", icon: HeartHandshake },
      {
        title: "Aduan & Aspirasi",
        href: "/quality/complaints",
        icon: MessageSquareWarning,
      },
    ],
  },
  {
    title: "Informasi",
    items: [{ title: "Pengumuman", href: "/announcements", icon: Bell }],
  },
];

export const navigationConfig: NavGroup[] = adminNavigation;

// Role category helpers
function isAdminRole(roleCode: string): boolean {
  return ADMIN_ROLES.includes(roleCode);
}

function isTeacherRole(roleCode: string): boolean {
  return TEACHER_ROLES.includes(roleCode);
}

function isStaffRole(roleCode: string): boolean {
  return STAFF_ROLES.includes(roleCode);
}

function isStudentRole(roleCode: string): boolean {
  return STUDENT_ROLES.includes(roleCode);
}

function isParentRole(roleCode: string): boolean {
  return PARENT_ROLES.includes(roleCode);
}

function isYayasanRole(roleCode: string): boolean {
  return YAYASAN_ROLES.includes(roleCode);
}

function isPrincipalRole(roleCode: string): boolean {
  if (!roleCode || typeof roleCode !== "string") return false;
  return roleCode.includes("KEPALA_SEKOLAH");
}

export interface ActiveRole {
  id: string;
  code: string;
  name: string;
  realm: string;
}

/**
 * Get navigation for a specific role code
 * Uses the new RoleCode-based system
 */
export function getNavigationForRoleCode(roleCode: string): NavGroup[] {
  if (!roleCode) return [];

  // Super Admin gets full admin navigation
  if (roleCode === "SUPER_ADMIN") {
    return adminNavigation;
  }

  // Yayasan roles
  if (isYayasanRole(roleCode)) {
    return yayasanNavigation;
  }

  // Kepala Sekolah gets kepala sekolah navigation
  if (isPrincipalRole(roleCode)) {
    return kepalaSekolahNavigation;
  }

  // Admin roles get admin navigation
  if (isAdminRole(roleCode)) {
    return adminNavigation
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.roleCodes || item.roleCodes.includes(roleCode),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }

  // Pesantren: leadership and field pengasuhan staff get different menus
  if (PESANTREN_PIMPINAN_ROLES.includes(roleCode)) {
    return pesantrenPimpinanNavigation;
  }

  if (PESANTREN_PENGASUHAN_ROLES.includes(roleCode)) {
    return pesantrenPengasuhanNavigation;
  }

  // Perguruan Tinggi
  if (PT_PIMPINAN_ROLES.includes(roleCode)) {
    return ptPimpinanNavigation;
  }

  if (roleCode === "PT_DOSEN") {
    return ptDosenNavigation;
  }

  if (roleCode === "PT_MAHASISWA") {
    return ptMahasiswaNavigation;
  }

  // Komite sekolah (external oversight) and alumni
  if (KOMITE_ROLES.includes(roleCode)) {
    return komiteNavigation;
  }

  if (ALUMNI_ROLES.includes(roleCode)) {
    return alumniNavigation;
  }

  // Teacher roles
  if (isTeacherRole(roleCode)) {
    return teacherNavigation;
  }

  // Staff roles
  if (isStaffRole(roleCode)) {
    return staffNavigation;
  }

  // Student roles
  if (isStudentRole(roleCode)) {
    return studentNavigation;
  }

  // Parent roles
  if (isParentRole(roleCode)) {
    return parentNavigation;
  }

  // Default to basic navigation
  return [
    {
      title: "Overview",
      items: [
        {
          title: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Notifications",
          href: "/notifications",
          icon: Bell,
        },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          title: "Settings",
          href: "/settings",
          icon: Settings,
        },
      ],
    },
  ];
}

/**
 * Legacy function - for backward compatibility
 * Maps old UserRole to appropriate navigation
 */
export function getNavigationForRole(role: string): NavGroup[] {
  // Map legacy roles to new role codes
  const legacyToRoleCode: Record<string, string> = {
    SUPER_ADMIN: "SUPER_ADMIN",
    UNIT_ADMIN: "SMPIT_ADMIN", // Default to SMPIT_ADMIN for legacy
    TEACHER: "SMPIT_GURU",
    STAFF: "SMPIT_TATA_USAHA",
    STUDENT: "SMPIT_SISWA",
    PARENT: "SMPIT_ORANG_TUA",
  };

  const roleCode = legacyToRoleCode[role] || role;
  return getNavigationForRoleCode(roleCode);
}

// Export role categories for use elsewhere
export {
  ADMIN_ROLES,
  TEACHER_ROLES,
  STAFF_ROLES,
  STUDENT_ROLES,
  PARENT_ROLES,
  YAYASAN_ROLES,
  PESANTREN_ROLES,
  PESANTREN_PIMPINAN_ROLES,
  PESANTREN_PENGASUHAN_ROLES,
  PT_PIMPINAN_ROLES,
  KOMITE_ROLES,
  ALUMNI_ROLES,
  isAdminRole,
  isTeacherRole,
  isStaffRole,
  isStudentRole,
  isParentRole,
  isYayasanRole,
  isPrincipalRole,
};
