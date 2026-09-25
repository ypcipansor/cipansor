import { Request, Response, NextFunction } from 'express';
import { parentService } from './parent.service';

export class ParentController {
  /**
   * Get parent dashboard summary
   */
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const data = await parentService.getDashboardSummary(parentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all children
   */
  async getChildren(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const data = await parentService.getChildren(parentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child profile
   */
  async getChildProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildProfile(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child attendance
   */
  async getChildAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildAttendance(parentId, studentId, req.query as any);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child tahfidz
   */
  async getChildTahfidz(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildTahfidz(parentId, studentId, req.query as any);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child ibadah
   */
  async getChildIbadah(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const { startDate, endDate } = req.query;

      // Default to current month if dates not provided
      const now = new Date();
      // Use YYYY-MM-DD format to avoid UTC timezone shifts when using toISOString() on midnight local dates
      // We manually format to YYYY-MM-DD using local time
      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const start = startDate
        ? String(startDate)
        : formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = endDate
        ? String(endDate)
        : formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

      const data = await parentService.getChildIbadah(parentId, studentId, {
        startDate: start,
        endDate: end,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child grades
   */
  async getChildGrades(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildGrades(parentId, studentId, req.query as any);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child weekly progress (attendance + tahfidz + behavior + academic)
   */
  async getChildWeeklyProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildWeeklyProgress(
        parentId,
        studentId,
        req.query as any
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child report cards
   */
  async getChildReportCards(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildReportCards(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child finance
   */
  async getChildFinance(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildFinance(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child counseling summaries shared with parents
   */
  async getChildCounseling(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildCounseling(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child violations
   */
  async getChildViolations(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildViolations(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child rewards
   */
  async getChildRewards(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildRewards(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get child health records
   */
  async getChildHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { studentId } = req.params;
      const data = await parentService.getChildHealth(parentId, studentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get announcements
   */
  async getAnnouncements(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const data = await parentService.getAnnouncements(parentId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get notifications
   */
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const data = await parentService.getNotifications(parentId, req.query as any);
      res.json({ success: true, ...data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.sub;
      const { notificationId } = req.params;
      const data = await parentService.markNotificationRead(parentId, notificationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const parentController = new ParentController();
