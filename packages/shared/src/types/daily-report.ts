import type {
  DAILY_MOOD_VALUES,
  MEAL_CONSUMPTION_VALUES,
} from "../schemas/daily-report";

export type DailyMood = (typeof DAILY_MOOD_VALUES)[number];

export type MealConsumption = (typeof MEAL_CONSUMPTION_VALUES)[number];

export interface DailyReportPhoto {
  id: string;
  dailyReportId: string;
  photoUrl: string;
  caption?: string;
  activityType?: string;
  createdAt: string;
}

export interface DailyReport {
  id: string;
  studentId: string;
  unitId: string;
  academicYearId?: string;
  reportDate: string;
  unitType:
    "PESANTREN" | "TK_QURAN" | "SD_IT" | "SMP_IT" | "SMA_QURAN" | "OTHER";
  arrivalTime?: string;
  mood?: DailyMood;
  healthStatus?: string;
  temperature?: number;
  hadBreakfast?: boolean;
  mealStatus?: MealConsumption;
  snackStatus?: MealConsumption;
  napDuration?: number;
  toiletNotes?: string;
  sholatDhuha?: boolean;
  sholatDzuhur?: boolean;
  sholatAshar?: boolean;
  sholatJamaah?: boolean;
  tahfidzActivity?: string;
  activitiesSummary?: string;
  achievements?: string;
  behaviorNotes?: string;
  teacherNotes?: string;
  homeActivity?: string;
  homework?: Array<{
    id?: string;
    subjectName: string;
    description: string;
    dueDate?: string | null;
  }>;
  departureTime?: string;
  pickedUpBy?: string;
  parentReadAt?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    nis: string;
    photoUrl?: string;
    user?: {
      name: string;
    };
    classId?: string;
  };
  unit?: {
    id: string;
    name: string;
  };
  createdBy?: {
    id: string;
    name: string;
  };
  photos?: DailyReportPhoto[];
}

/**
 * What POST /daily-report/bulk answers. A pupil outside the caller's scope, or
 * one who already has a report that day, is in `details.failed` and is left
 * as it was; the others are made.
 */
export interface BulkCreateDailyReportsResult {
  created: number;
  failed: number;
  details: {
    success: string[];
    failed: { studentId: string; error: string }[];
  };
}

// The inputs (create, update, bulk, confirm) and their validation are in
// `schemas/daily-report.ts`: one contract, read by the API and the web.
