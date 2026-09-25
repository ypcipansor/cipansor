import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { attendanceService } from './attendance.service';
import {
  ApiResponse,
  SharedPaginatedResponse,
  Attendance,
  AttendanceSummary,
  AttendanceCalendarResponse,
  CreateAttendanceInput,
  BulkAttendanceInput,
  UpdateAttendanceInput,
} from '@cipansor/shared';
import type { ListAttendanceQuery, AttendanceSummaryQuery } from './attendance.schema';

/**
 * List attendance records
 * GET /api/attendance
 */
export const list = asyncHandler(
  async (req: Request, res: Response<SharedPaginatedResponse<Attendance>>) => {
    const query = (res.locals.validatedQuery || req.query) as ListAttendanceQuery;
    const result = await attendanceService.findAll(query, req.user!);

    res.json({
      success: true,
      data: result.records,
      meta: {
        pagination: result.pagination,
      },
    });
  }
);

/**
 * Get attendance by ID
 * GET /api/attendance/:id
 */
export const getById = asyncHandler(
  async (req: Request, res: Response<ApiResponse<Attendance>>) => {
    const { id } = req.params;
    const attendance = await attendanceService.findById(id, req.user!);

    res.json({
      success: true,
      data: attendance,
    });
  }
);

/**
 * Create single attendance
 * POST /api/attendance
 */
export const create = asyncHandler(async (req: Request, res: Response<ApiResponse<Attendance>>) => {
  const input: CreateAttendanceInput = req.body;
  const attendance = await attendanceService.create(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: attendance,
  });
});

/**
 * Bulk create attendance
 * POST /api/attendance/bulk
 */
export const bulkCreate = asyncHandler(
  async (req: Request, res: Response<ApiResponse<{ created: number; skipped: number }>>) => {
    const input: BulkAttendanceInput = req.body;
    const result = await attendanceService.bulkCreate(input, req.user!.sub);

    res.status(201).json({
      success: true,
      data: result,
    });
  }
);

/**
 * Update attendance
 * PATCH /api/attendance/:id
 */
export const update = asyncHandler(async (req: Request, res: Response<ApiResponse<Attendance>>) => {
  const { id } = req.params;
  const input: UpdateAttendanceInput = req.body;
  const attendance = await attendanceService.update(id, input, {
    role: req.user!.role,
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: attendance,
  });
});

/**
 * Delete attendance
 * DELETE /api/attendance/:id
 */
export const remove = asyncHandler(
  async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    const { id } = req.params;
    const result = await attendanceService.delete(id, {
      role: req.user!.role,
      roleCode: req.user!.roleCode,
      unitId: req.user!.unitId,
    });

    res.json({
      success: true,
      data: result,
    });
  }
);

/**
 * Get attendance summary
 * GET /api/attendance/summary
 */
export const getSummary = asyncHandler(
  async (req: Request, res: Response<ApiResponse<AttendanceSummary>>) => {
    const query = (res.locals.validatedQuery || req.query) as AttendanceSummaryQuery;
    const summary = await attendanceService.getSummary(query, req.user!);

    res.json({
      success: true,
      data: summary,
    });
  }
);

/**
 * Get attendance calendar for a class (monthly view)
 * GET /api/attendance/calendar/:classId
 */
export const getCalendar = asyncHandler(
  async (req: Request, res: Response<ApiResponse<AttendanceCalendarResponse>>) => {
    const { classId } = req.params;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string);

    if (isNaN(month) || month < 0 || month > 11) {
      return res.status(400).json({
        success: false,
        data: null as any,
        error: {
          code: 'INVALID_PARAM',
          message: 'Invalid month parameter (0-11 required)',
        },
      });
    }

    const calendar = await attendanceService.getCalendar(classId, year, month, {
      role: req.user!.role,
      roleCode: req.user!.roleCode,
      unitId: req.user!.unitId,
    });

    res.json({
      success: true,
      data: calendar,
    });
  }
);
