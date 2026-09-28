/**
 * Export Analytics Controller
 */

import { Request, Response, NextFunction } from 'express';
import * as exportService from './export.service';
import { requireUser } from '@/middleware/auth';
import { seesAllUnits } from '@/utils/resolve-unit-id';

/**
 * The unit an export may cover: any (or all) for a cross-unit account, the
 * account's own unit for everyone else — `?unitId=` used to pick any unit.
 */
function exportUnitId(req: Request): string | undefined {
  const user = requireUser(req);
  if (seesAllUnits(user)) return (req.query.unitId as string | undefined) || undefined;
  return user.unitId ?? '__no_unit__';
}

/**
 * Export students data
 */
export async function exportStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const { format = 'json' } = req.query;
    const data = await exportService.exportStudentsData({
      unitId: exportUnitId(req),
      format: format as 'json' | 'csv',
    });

    if (format === 'csv') {
      const csv = exportService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
}

/**
 * Export attendance data
 */
export async function exportAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    const data = await exportService.exportAttendanceData({
      unitId: exportUnitId(req),
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      format: format as 'json' | 'csv',
    });

    if (format === 'csv') {
      const csv = exportService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
}

/**
 * Export finance data
 */
export async function exportFinance(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    const data = await exportService.exportFinanceData({
      unitId: exportUnitId(req),
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      format: format as 'json' | 'csv',
    });

    if (format === 'csv') {
      const csv = exportService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="finance_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
}

/**
 * Export tahfidz data
 */
export async function exportTahfidz(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    const data = await exportService.exportTahfidzData({
      unitId: exportUnitId(req),
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      format: format as 'json' | 'csv',
    });

    if (format === 'csv') {
      const csv = exportService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="tahfidz_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
}

/**
 * Export comprehensive data
 */
export async function exportAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = req.query;
    const data = await exportService.getComprehensiveExport({
      unitId: exportUnitId(req),
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      format: 'json',
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
