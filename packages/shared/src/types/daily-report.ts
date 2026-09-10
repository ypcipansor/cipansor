export type DailyMood =
  | "HAPPY"
  | "NEUTRAL"
  | "SAD"
  | "TIRED"
  | "EXCITED"
  | "SICK";

export type MealConsumption = "HABIS" | "SETENGAH" | "SEDIKIT" | "TIDAK_MAU";

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
    | "PESANTREN"
    | "TK_QURAN"
    | "SD_IT"
    | "SMP_IT"
    | "SMA_QURAN"
    | "OTHER";
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
    nisn: string;
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

export interface CreateDailyReportInput {
  studentId: string;
  unitId: string;
  academicYearId: string;
  reportDate: string;
  morningMood?: DailyMood;
  healthNotes?: string;
  temperature?: number;
  sholatDhuha?: boolean;
  sholatDzuhur?: boolean;
  sholatAshar?: boolean;
  sholatJamaah?: boolean;
  breakfastConsumption?: string; // Should be stricter ideally, but mapped in service
  lunchConsumption?: string;
  snackConsumption?: string;
  napDurationMinutes?: number;
  toiletingNotes?: string;
  activitiesSummary?: string;
  learningAchievements?: string;
  surahPractice?: string;
  behaviorNotes?: string;
  parentNotes?: string;
  homeworkSuggestion?: string;
  homework?: Array<{
    subjectName: string;
    description: string;
    dueDate?: string | null;
  }>;
  photoUrls?: string[];
}

export interface UpdateDailyReportInput extends Partial<
  Omit<
    CreateDailyReportInput,
    "studentId" | "unitId" | "academicYearId" | "reportDate"
  >
> {}

export interface BulkCreateDailyReportsInput {
  unitId: string;
  academicYearId: string;
  reportDate: string;
  reports: Array<{
    studentId: string;
    arrivalTime?: string;
    morningMood?: DailyMood;
    healthNotes?: string;
    breakfastConsumption?: string;
    lunchConsumption?: string;
    activitiesSummary?: string;
    ibadahNotes?: string; // tahfidzActivity
    parentNotes?: string; // teacherNotes
    sholatDhuha?: boolean;
    sholatDzuhur?: boolean;
    sholatAshar?: boolean;
    sholatJamaah?: boolean;
    readingProgress?: {
      bookId: string;
      page: number;
    };
    tahfidzProgress?: {
      surahName: string;
      surahNumber: number;
      ayahStart: number;
      ayahEnd: number;
    };
  }>;
}
