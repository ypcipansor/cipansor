import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { DAY_OF_WEEK_BY_INDEX } from "@cipansor/shared";

// Types
export interface TeacherStats {
  totalStudents: number;
  totalClasses: number;
  setoranToday: number;
  setoranYesterday: number;
  /**
   * null when none of the teacher's students has a tahfidz target for the
   * active academic year — there is nothing to measure against. Render the
   * absence; do not coalesce it to 0, which would read as "0% achieved".
   */
  targetAchievement: number | null;
  studentsWithTarget: number;
  todayScheduleCount: number;
  weeklySetoranCount: number;
  monthlySetoranCount: number;
}

export interface TeachingScheduleItem {
  id: string;
  time: string;
  endTime?: string;
  activity: string;
  className?: string;
  subject?: string;
  room?: string;
  studentCount?: number;
  status: "completed" | "ongoing" | "upcoming";
  type: "ACADEMIC" | "RELIGIOUS" | "TAHFIDZ" | "EXTRACURRICULAR";
}

/**
 * A recorded setoran.
 *
 * `score` is the only quality figure TahfidzRecord stores, and it is optional.
 * The previous shape carried `grade` and `status`, neither of which exists on
 * the record: `grade` defaulted to the literal "MAQBUL" and `status` was then
 * derived from that invented grade, so every entry rendered "Perlu Muraja'ah"
 * regardless of how the student actually recited.
 */
export interface RecentSetoran {
  id: string;
  studentName: string;
  surahName: string;
  juz: number;
  ayahStart: number;
  ayahEnd: number;
  type: "ZIYADAH" | "MUROJAAH" | "TASMI" | "ASSESSMENT";
  score: number | null;
  createdAt: string;
  className?: string;
}

export interface ClassSummary {
  id: string;
  name: string;
  level: string;
  studentCount: number;
  isHomeroom: boolean;
}

export interface TeacherDashboardData {
  stats: TeacherStats;
  todaySchedule: TeachingScheduleItem[];
  recentSetoran: RecentSetoran[];
  classes: ClassSummary[];
}

/** Exactly what `GET /dashboard/teacher` returns. */
interface TeacherScheduleResponseItem {
  id: string;
  startTime: string;
  endTime: string;
  subjectName: string | null;
  className: string | null;
  room: string | null;
  studentCount: number;
}

interface TeacherSetoranResponseItem {
  id: string;
  studentName: string;
  className: string | null;
  surahName: string;
  juz: number;
  ayahStart: number;
  ayahEnd: number;
  activityType: string;
  score: number | null;
  recordedAt: string;
}

interface TeacherClassResponseItem {
  id: string;
  name: string;
  level: string;
  studentCount: number;
  isHomeroom: boolean;
}

interface TeacherDashboardResponse {
  totalStudents: number;
  totalClasses: number;
  setoranToday: number;
  setoranYesterday: number;
  weeklySetoranCount: number;
  monthlySetoranCount: number;
  targetAchievement: number | null;
  studentsWithTarget: number;
  todaySchedule: TeacherScheduleResponseItem[];
  recentSetoran: TeacherSetoranResponseItem[];
  classes: TeacherClassResponseItem[];
}

/**
 * The single query behind both the stat row and the timetable.
 *
 * They share a cache entry deliberately — one request, one source of truth —
 * so each caller derives its own shape with `select` rather than fetching
 * again. Giving them separate queryFns under the same key would let whichever
 * mounted first decide what the cached value looks like.
 */
function useTeacherDashboardQuery<T>(
  select: (data: TeacherDashboardResponse) => T,
) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["teacher", "dashboard", user?.id],
    queryFn: async (): Promise<TeacherDashboardResponse> => {
      const { data } = await api.get("/dashboard/teacher");
      return data.data;
    },
    select,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch the signed-in teacher's own statistics.
 *
 * One call to an endpoint that scopes to the caller. The previous version
 * stitched three general-purpose endpoints together client-side and got every
 * number wrong: it read `meta.total` where /students returns
 * `meta.pagination.total`, defaulted the class count to a literal 4 that no
 * response could ever override, asked /tahfidz/stats for five keys it does not
 * return, and passed a teacherId that neither /students nor /classes filters
 * on — so even the figures that did arrive described every student the user
 * could see rather than the teacher's own.
 *
 * Errors are no longer swallowed into a row of zeros. A zero is a claim that
 * the teacher recorded nothing today; a failed request means we do not know,
 * and the caller must be able to tell those apart.
 */
export function useTeacherStats() {
  return useTeacherDashboardQuery<TeacherStats>((stats) => ({
    totalStudents: stats.totalStudents,
    totalClasses: stats.totalClasses,
    setoranToday: stats.setoranToday,
    setoranYesterday: stats.setoranYesterday,
    targetAchievement: stats.targetAchievement,
    studentsWithTarget: stats.studentsWithTarget,
    todayScheduleCount: stats.todaySchedule.length,
    weeklySetoranCount: stats.weeklySetoranCount,
    monthlySetoranCount: stats.monthlySetoranCount,
  }));
}

/**
 * Today's teaching schedule for the signed-in teacher.
 *
 * The server resolves which teacher that is. The client used to send its own
 * `user.id` as `teacherId`, but Schedule.teacherId references Teacher.id and
 * the JWT carries no teacherId — so the filter matched nothing and the widget
 * fell back to a hardcoded timetable ("Tahfidz Pagi - Kelas 7A" and four more)
 * that belonged to no one. That fallback is gone: an empty day now renders as
 * an empty day.
 */
export function useTeacherTodaySchedule() {
  return useTeacherDashboardQuery<TeachingScheduleItem[]>((stats) =>
    stats.todaySchedule.map((schedule) => {
      const toMinutes = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };

      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      let status: "completed" | "ongoing" | "upcoming" = "upcoming";
      if (currentTime > toMinutes(schedule.endTime)) {
        status = "completed";
      } else if (currentTime >= toMinutes(schedule.startTime)) {
        status = "ongoing";
      }

      return {
        id: schedule.id,
        time: schedule.startTime,
        endTime: schedule.endTime,
        activity: schedule.subjectName
          ? `${schedule.subjectName} - ${schedule.className ?? "Kelas"}`
          : (schedule.className ?? "Kegiatan"),
        className: schedule.className ?? undefined,
        subject: schedule.subjectName ?? undefined,
        room: schedule.room ?? undefined,
        studentCount: schedule.studentCount,
        status,
        type: "TAHFIDZ" as const,
      };
    }),
  );
}

/**
 * The setoran this teacher recorded most recently.
 *
 * Previously called the general /tahfidz list with a `teacherId` param that
 * endpoint does not accept, so it listed whatever records the caller could
 * see — other teachers' work included.
 */
export function useTeacherRecentSetoran(limit: number = 5) {
  return useTeacherDashboardQuery<RecentSetoran[]>((stats) =>
    stats.recentSetoran.slice(0, limit).map((record) => ({
      id: record.id,
      studentName: record.studentName,
      surahName: record.surahName,
      juz: record.juz,
      ayahStart: record.ayahStart,
      ayahEnd: record.ayahEnd,
      type: record.activityType as RecentSetoran["type"],
      score: record.score,
      createdAt: record.recordedAt,
      className: record.className ?? undefined,
    })),
  );
}

/**
 * The teacher's own classes. `/classes` has no teacherId filter, which is why
 * this used to render every class the caller could see.
 */
export function useTeacherClasses() {
  return useTeacherDashboardQuery<ClassSummary[]>((stats) =>
    stats.classes.map((cls) => ({
      id: cls.id,
      name: cls.name,
      level: cls.level,
      studentCount: cls.studentCount,
      isHomeroom: cls.isHomeroom,
    })),
  );
}

// Fetch announcements for teacher
export function useTeacherAnnouncements(limit: number = 3) {
  return useQuery({
    queryKey: ["teacher", "announcements", limit],
    queryFn: async () => {
      try {
        const response = await api.get("/announcements/recent", {
          params: { limit },
        });
        return response.data.data || [];
      } catch (error) {
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Combined dashboard hook
export function useTeacherDashboard() {
  const stats = useTeacherStats();
  const todaySchedule = useTeacherTodaySchedule();
  const recentSetoran = useTeacherRecentSetoran(5);
  const classes = useTeacherClasses();
  const announcements = useTeacherAnnouncements(3);

  return {
    stats: stats.data,
    todaySchedule: todaySchedule.data,
    recentSetoran: recentSetoran.data,
    classes: classes.data,
    announcements: announcements.data,
    isLoading:
      stats.isLoading || todaySchedule.isLoading || recentSetoran.isLoading,
    isError: stats.isError && todaySchedule.isError && recentSetoran.isError,
    refetch: () => {
      stats.refetch();
      todaySchedule.refetch();
      recentSetoran.refetch();
      classes.refetch();
      announcements.refetch();
    },
  };
}

/**
 * Render a setoran score.
 *
 * TahfidzRecord stores an optional numeric `score` and nothing else about
 * quality — there is no grade enum and no lancar/tidak-lancar status. The
 * helpers that used to map those did so over values the frontend invented.
 */
export function getScoreDisplay(score: number | null): {
  label: string;
  color: string;
} {
  if (score === null) {
    return { label: "Belum dinilai", color: "bg-gray-100 text-gray-700" };
  }
  if (score >= 90)
    return { label: String(score), color: "bg-green-100 text-green-800" };
  if (score >= 75)
    return { label: String(score), color: "bg-blue-100 text-blue-800" };
  if (score >= 60)
    return { label: String(score), color: "bg-yellow-100 text-yellow-800" };
  return { label: String(score), color: "bg-red-100 text-red-800" };
}

// Schedule status helper
export function getScheduleStatusDisplay(status: string): {
  label: string;
  color: string;
} {
  const statuses: Record<string, { label: string; color: string }> = {
    completed: { label: "Selesai", color: "bg-green-100 text-green-700" },
    ongoing: { label: "Berlangsung", color: "bg-blue-100 text-blue-700" },
    upcoming: { label: "Akan Datang", color: "bg-gray-100 text-gray-700" },
  };

  return (
    statuses[status] || { label: status, color: "bg-gray-100 text-gray-700" }
  );
}
