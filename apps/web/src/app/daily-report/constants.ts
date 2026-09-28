import { DailyMood } from "@/hooks/use-daily-report";

export const MOOD_OPTIONS: { value: DailyMood; label: string }[] = [
  { value: "HAPPY", label: "😊 Senang" },
  { value: "EXCITED", label: "🤩 Antusias" },
  { value: "NEUTRAL", label: "😐 Biasa" },
  { value: "TIRED", label: "😴 Lelah" },
  { value: "SAD", label: "😢 Sedih" },
  { value: "SICK", label: "🤒 Sakit" },
];

export const HEALTH_OPTIONS = [
  { value: "Sehat", label: "Sehat" },
  { value: "Sakit", label: "Sakit" },
  { value: "Pemulihan", label: "Pemulihan" },
  { value: "Perlu Perhatian", label: "Perlu Perhatian" },
];

export const CONSUMPTION_OPTIONS = [
  { value: "HABIS", label: "Habis" },
  { value: "SETENGAH", label: "Setengah" },
  { value: "SEDIKIT", label: "Sedikit" },
  { value: "TIDAK_MAU", label: "Tidak Mau" },
];

export const ATTENDANCE_OPTIONS = [
  { value: "PRESENT", label: "Hadir", color: "text-green-600" },
  { value: "LATE", label: "Terlambat", color: "text-yellow-600" },
  { value: "SICK", label: "Sakit", color: "text-orange-600" },
  { value: "EXCUSED", label: "Izin", color: "text-blue-600" },
  { value: "ABSENT", label: "Alpha", color: "text-red-600" },
];
