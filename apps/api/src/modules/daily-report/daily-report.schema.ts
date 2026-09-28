// The daily report contract lives once, in @cipansor/shared
// (schemas/daily-report.ts): the web builds its forms from it and this module
// validates with it at the edge.
export {
  listDailyReportsQuerySchema,
  createDailyReportSchema,
  updateDailyReportSchema,
  confirmDailyReportSchema,
  bulkCreateDailyReportsSchema,
  studentDailySummaryQuerySchema,
  classDailySummaryQuerySchema,
} from '@cipansor/shared';
export type {
  ListDailyReportsQuery,
  CreateDailyReportInput,
  UpdateDailyReportInput,
  ConfirmDailyReportInput,
  BulkCreateDailyReportsInput,
  StudentDailySummaryQuery,
  ClassDailySummaryQuery,
} from '@cipansor/shared';
