import { Request, Response, NextFunction } from 'express';
import { homeroomService } from './homeroom.service';

export class HomeroomController {
  async getMyClasses(req: Request, res: Response, next: NextFunction) {
    try {
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const classes = await homeroomService.getMyClasses(user);
      res.json({ data: classes });
    } catch (error) {
      next(error);
    }
  }

  async getPerformanceOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const { unitId } = req.query;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const overview = await homeroomService.getPerformanceOverview(
        user,
        unitId as string | undefined
      );
      res.json({ data: overview });
    } catch (error) {
      next(error);
    }
  }

  async getClassDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const dashboard = await homeroomService.getClassDashboard(classId, user);
      res.json({ data: dashboard });
    } catch (error) {
      next(error);
    }
  }

  async getHomeroomStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const students = await homeroomService.getHomeroomStudents(classId, user);
      res.json({ data: students });
    } catch (error) {
      next(error);
    }
  }

  async getAttendanceSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const summary = await homeroomService.getAttendanceSummary(classId, startDate, endDate, user);
      res.json({ data: summary });
    } catch (error) {
      next(error);
    }
  }

  async getAcademicMonitoring(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const monitoring = await homeroomService.getAcademicMonitoring(classId, user);
      res.json({ data: monitoring });
    } catch (error) {
      next(error);
    }
  }

  async getStudentDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const student = await homeroomService.getStudentDetail(studentId, user);
      res.json({ data: student });
    } catch (error) {
      next(error);
    }
  }

  async getStudentNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const notes = await homeroomService.getStudentNotes(studentId, user);
      res.json({ data: notes });
    } catch (error) {
      next(error);
    }
  }

  async createStudentNote(req: Request, res: Response, next: NextFunction) {
    try {
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const note = await homeroomService.createStudentNote(req.body, user);
      res.status(201).json({ data: note });
    } catch (error) {
      next(error);
    }
  }

  async updateStudentNote(req: Request, res: Response, next: NextFunction) {
    try {
      const { noteId } = req.params;
      const noteType = req.body.noteType || 'violation';
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const note = await homeroomService.updateStudentNote(noteId, req.body, noteType, user);
      res.json({ data: note });
    } catch (error) {
      next(error);
    }
  }

  async deleteStudentNote(req: Request, res: Response, next: NextFunction) {
    try {
      const { noteId } = req.params;
      const noteType = (req.query.noteType as 'violation' | 'reward') || 'violation';
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      await homeroomService.deleteStudentNote(noteId, noteType, user);
      res.json({ success: true, message: 'Note deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getBehaviorRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = req.query.classId as string;
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const records = await homeroomService.getBehaviorRecords(classId, user);
      res.json({ data: records });
    } catch (error) {
      next(error);
    }
  }

  async recordBehavior(req: Request, res: Response, next: NextFunction) {
    try {
      const user = {
        sub: req.user!.sub,
        role: req.user!.role,
        roleCode: req.user!.roleCode,
        unitId: req.user!.unitId,
      };
      const record = await homeroomService.recordBehavior(req.body, user);
      res.status(201).json({ data: record });
    } catch (error) {
      next(error);
    }
  }
}

export const homeroomController = new HomeroomController();
