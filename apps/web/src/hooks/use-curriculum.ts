import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CURRICULUM_MANAGER_ROLE_CODES,
  SUBJECT_TYPE_VALUES,
  type AssignTeacherSubjectInput,
  type CreateSubjectInput,
  type Subject,
  type SubjectType,
  type UpdateSubjectInput,
} from "@cipansor/shared";
import api from "@/lib/api";
import { getActiveRoleCode } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth";

export type { Subject, SubjectType, TeacherSubject } from "@cipansor/shared";

// Types
export type ScheduleDay =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export const SUBJECT_TYPES: readonly SubjectType[] = SUBJECT_TYPE_VALUES;
export const SCHEDULE_DAYS: ScheduleDay[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

/**
 * The API's types. The web offered "Wajib/Pilihan" (REQUIRED/ELECTIVE) until
 * 2026-09-26, which the API refused, so no subject could be added.
 */
export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  ACADEMIC: "Umum",
  RELIGIOUS: "Keagamaan",
  TAHFIDZ: "Tahfidz",
  EXTRACURRICULAR: "Ekstrakurikuler",
};

/** One colour per type, for every badge that shows it. */
export const SUBJECT_TYPE_BADGE_CLASS: Record<SubjectType, string> = {
  ACADEMIC: "bg-blue-100 text-blue-800",
  RELIGIOUS: "bg-green-100 text-green-800",
  TAHFIDZ: "bg-amber-100 text-amber-800",
  EXTRACURRICULAR: "bg-purple-100 text-purple-800",
};

/** KKM as a number; the API sends the decimal column as text. */
export const passingScoreOf = (subject: Pick<Subject, "passingScore">) =>
  Number(subject.passingScore);

/**
 * Whether the signed-in role keeps subjects and guru pengampu — the list the
 * API's routes check. The API also holds everyone but the super admin to
 * their own unit.
 */
export function useCanManageSubjects(): boolean {
  const user = useAuthStore((s) => s.user);
  return CURRICULUM_MANAGER_ROLE_CODES.includes(getActiveRoleCode(user) ?? "");
}

export const SCHEDULE_DAY_LABELS: Record<ScheduleDay, string> = {
  MONDAY: "Senin",
  TUESDAY: "Selasa",
  WEDNESDAY: "Rabu",
  THURSDAY: "Kamis",
  FRIDAY: "Jumat",
  SATURDAY: "Sabtu",
  SUNDAY: "Minggu",
};

export interface Curriculum {
  id: string;
  name: string;
  code: string;
  description?: string;
  academicYearId: string;
  academicYear?: {
    id: string;
    name: string;
  };
  unitId: string;
  unit?: {
    id: string;
    name: string;
  };
  gradeLevel: number;
  isActive: boolean;
  subjects?: CurriculumSubject[];
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumSubject {
  id: string;
  curriculumId: string;
  subjectId: string;
  subject?: Subject;
  semester: number;
  sequence: number;
  isRequired: boolean;
}

export interface Schedule {
  id: string;
  classId: string;
  class?: {
    id: string;
    name: string;
  };
  subjectId: string;
  subject?: Subject;
  teacherId: string;
  teacher?: {
    id: string;
    name: string;
  };
  day: ScheduleDay;
  startTime: string;
  endTime: string;
  room?: string;
  notes?: string;
  isActive: boolean;
  academicYearId: string;
  createdAt: string;
  updatedAt: string;
}

// Subject queries
/**
 * A unit's subjects, alphabetically. The API pages at 20 by default, so every
 * select that listed subjects showed only the first 20; this asks for the
 * API's maximum.
 */
export function useSubjects(params?: {
  unitId?: string;
  type?: SubjectType;
  isActive?: boolean;
  search?: string;
}) {
  return useQuery({
    queryKey: ["subjects", params],
    queryFn: async () => {
      const response = await api.get("/curriculum/subjects", {
        params: { limit: 100, ...params },
      });
      return response.data.data as Subject[];
    },
  });
}

/**
 * The subject table: the rows and how many there are in all, so the page can
 * say when the list is cut at the API's maximum.
 */
export function useSubjectList(params?: {
  unitId?: string;
  type?: SubjectType;
  search?: string;
}) {
  return useQuery({
    queryKey: ["subjects", "list", params],
    queryFn: async () => {
      const response = await api.get("/curriculum/subjects", {
        params: { limit: 100, ...params },
      });
      return {
        rows: response.data.data as Subject[],
        total: (response.data.meta?.total as number | undefined) ?? 0,
      };
    },
  });
}

/** One subject with its guru pengampu. */
export function useSubject(id: string) {
  return useQuery({
    queryKey: ["subjects", "detail", id],
    queryFn: async () => {
      const response = await api.get(`/curriculum/subjects/${id}`);
      return response.data.data as Subject;
    },
    enabled: !!id,
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSubjectInput) => {
      const response = await api.post("/curriculum/subjects", data);
      return response.data.data as Subject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSubjectInput;
    }) => {
      // The API answers PATCH; until 2026-09-26 this sent PUT and every edit
      // came back "not found".
      const response = await api.patch(`/curriculum/subjects/${id}`, data);
      return response.data.data as Subject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/curriculum/subjects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

/** A schedule row as the API sends it (the timetable pages still map theirs). */
export interface SubjectScheduleRow {
  id: string;
  dayOfWeek: ScheduleDay;
  startTime: string;
  endTime: string;
  room: string | null;
  class: { id: string; name: string } | null;
  teacher: { id: string; user: { name: string } } | null;
}

/**
 * The weekly schedule of one subject. The subject page asked `/schedules`
 * for `subjectId`, which the API dropped, and listed every schedule in the
 * school under each subject.
 */
export function useSubjectSchedules(subjectId: string) {
  return useQuery({
    queryKey: ["schedules", "subject", subjectId],
    queryFn: async () => {
      const response = await api.get("/curriculum/schedules", {
        params: { subjectId, isActive: true, limit: 100 },
      });
      return response.data.data as SubjectScheduleRow[];
    },
    enabled: !!subjectId,
  });
}

// Guru pengampu — `/curriculum/teacher-subjects`. The web called
// `/curriculum/teacher-assignments`, which the API never served.

export function useAssignTeacherToSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AssignTeacherSubjectInput) => {
      const response = await api.post("/curriculum/teacher-subjects", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

export function useRemoveTeacherFromSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/curriculum/teacher-subjects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

// Curriculum queries
export function useCurriculums(params?: {
  unitId?: string;
  academicYearId?: string;
  gradeLevel?: number;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: ["curriculums", params],
    queryFn: async () => {
      const response = await api.get("/curriculum/curriculums", { params });
      return response.data.data as Curriculum[];
    },
  });
}

export function useCurriculum(id: string) {
  return useQuery({
    queryKey: ["curriculum", id],
    queryFn: async () => {
      const response = await api.get(`/curriculum/curriculums/${id}`);
      return response.data.data as Curriculum;
    },
    enabled: !!id,
  });
}

export function useCreateCurriculum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Curriculum>) => {
      const response = await api.post("/curriculum/curriculums", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculums"] });
    },
  });
}

export function useUpdateCurriculum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Curriculum>;
    }) => {
      const response = await api.put(`/curriculum/curriculums/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculums"] });
    },
  });
}

export function useDeleteCurriculum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/curriculum/curriculums/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculums"] });
    },
  });
}

export function useAddSubjectToCurriculum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      curriculumId,
      subjectId,
      semester,
      sequence,
      isRequired,
    }: {
      curriculumId: string;
      subjectId: string;
      semester: number;
      sequence: number;
      isRequired: boolean;
    }) => {
      const response = await api.post(
        `/curriculum/curriculums/${curriculumId}/subjects`,
        {
          subjectId,
          semester,
          sequence,
          isRequired,
        },
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculums"] });
    },
  });
}

export function useRemoveSubjectFromCurriculum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      curriculumId,
      curriculumSubjectId,
    }: {
      curriculumId: string;
      curriculumSubjectId: string;
    }) => {
      await api.delete(
        `/curriculum/curriculums/${curriculumId}/subjects/${curriculumSubjectId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculums"] });
    },
  });
}

// Schedule queries
export function useSchedules(params?: {
  classId?: string;
  teacherId?: string;
  subjectId?: string;
  day?: ScheduleDay;
  academicYearId?: string;
}) {
  return useQuery({
    queryKey: ["schedules", params],
    queryFn: async () => {
      const response = await api.get("/curriculum/schedules", { params });
      return response.data.data as Schedule[];
    },
  });
}

export function useClassSchedule(classId: string, academicYearId?: string) {
  return useQuery({
    queryKey: ["class-schedule", classId, academicYearId],
    queryFn: async () => {
      const response = await api.get(`/curriculum/schedules/class/${classId}`, {
        params: { academicYearId },
      });
      return response.data.data as Schedule[];
    },
    enabled: !!classId,
  });
}

export function useTeacherSchedule(teacherId: string, academicYearId?: string) {
  return useQuery({
    queryKey: ["teacher-schedule", teacherId, academicYearId],
    queryFn: async () => {
      const response = await api.get(
        `/curriculum/schedules/teacher/${teacherId}`,
        {
          params: { academicYearId },
        },
      );
      return response.data.data as Schedule[];
    },
    enabled: !!teacherId,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Schedule>) => {
      const response = await api.post("/curriculum/schedules", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["class-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-schedule"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Schedule>;
    }) => {
      const response = await api.put(`/curriculum/schedules/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["class-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-schedule"] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/curriculum/schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["class-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-schedule"] });
    },
  });
}
