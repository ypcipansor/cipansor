import { Request, Response, NextFunction } from 'express';
import waveService from './ppdb-wave.service';
import { ApiResponse } from '@/utils/response';
import { Errors } from '@/middleware/error';
import { assertRegistrantUnitAccess } from './admissions.service';

export const waveController = {
  /**
   * GET /api/ppdb-waves
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, periodId, status } = req.query;

      const result = await waveService.findAll(
        {
          page: Number(page),
          limit: Number(limit),
          periodId: periodId as string,
          status: status as string,
        },
        req.user
      );

      res.json(ApiResponse.success(result.data, 'Waves retrieved successfully', result.pagination));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/ppdb-waves/active/:periodId
   */
  async listActive(req: Request, res: Response, next: NextFunction) {
    try {
      const waves = await waveService.findActiveForPeriod(req.params.periodId);
      res.json(ApiResponse.success(waves, 'Active waves retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/ppdb-waves/stats/:periodId
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await waveService.getStats(req.params.periodId, req.user);
      res.json(ApiResponse.success(stats));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/ppdb-waves/:id
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const wave = await waveService.findById(req.params.id, req.user);

      if (!wave) {
        return res.status(404).json(ApiResponse.error('Wave not found'));
      }

      res.json(ApiResponse.success(wave));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/ppdb-waves/:id/registrants
   */
  async getRegistrants(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const result = await waveService.getRegistrantsByWave(
        req.params.id,
        {
          page: Number(page),
          limit: Number(limit),
          status: status as string,
        },
        req.user
      );

      res.json(
        ApiResponse.success(result.data, 'Registrants retrieved successfully', result.pagination)
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/ppdb-waves
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const wave = await waveService.create(req.body, req.user);
      res.status(201).json(ApiResponse.success(wave, 'Wave created successfully'));
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        return res.status(400).json(ApiResponse.error(error.message));
      }
      next(error);
    }
  },

  /**
   * PUT /api/ppdb-waves/:id
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const wave = await waveService.update(req.params.id, req.body, req.user);
      res.json(ApiResponse.success(wave, 'Wave updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/ppdb-waves/:id
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await waveService.delete(req.params.id, req.user);
      res.json(ApiResponse.success(null, 'Wave deleted successfully'));
    } catch (error: any) {
      if (error.message?.includes('Cannot delete')) {
        return res.status(400).json(ApiResponse.error(error.message));
      }
      next(error);
    }
  },

  /**
   * POST /api/ppdb-waves/assign
   */
  async assignRegistrant(req: Request, res: Response, next: NextFunction) {
    try {
      const { registrantId, waveId } = req.body;
      const registrant = await waveService.assignRegistrant(registrantId, waveId, req.user);
      res.json(ApiResponse.success(registrant, 'Registrant assigned to wave successfully'));
    } catch (error: any) {
      if (error.message?.includes('full') || error.message?.includes('not found')) {
        return res.status(400).json(ApiResponse.error(error.message));
      }
      next(error);
    }
  },

  /**
   * POST /api/ppdb-waves/update-statuses
   * Update wave statuses based on dates (can be called by cron job)
   */
  async updateStatuses(req: Request, res: Response, next: NextFunction) {
    try {
      await waveService.updateWaveStatuses();
      res.json(ApiResponse.success(null, 'Wave statuses updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/ppdb-waves/onboard-registrant
   * End-to-end Student Onboarding using Orchestrator
   */
  async onboardRegistrant(req: Request, res: Response, next: NextFunction) {
    try {
      // Lazy load to avoid circular dependencies if any
      const { StudentOnboardingOrchestrator } = await import('@/services/integration/student-onboarding.orchestrator');

      // The route already validates the body with `onboardRegistrantSchema`
      // (see ppdb-wave.routes.ts), so `req.body` is fully shaped here.
      const data = req.body as {
        registrantId: string;
        unitId?: string;
        classId?: string;
        assignedClassId?: string;
        roomId?: string;
        nis?: string;
        nisn?: string;
        academicYearId?: string;
      };

      if (!req.user?.id) {
        throw Errors.unauthorized('User not authenticated');
      }
      const processedById = req.user.id;

      // Onboarding is also a by-id registrant operation: a non-super admin may
      // only onboard registrants whose admission period belongs to their unit.
      await assertRegistrantUnitAccess(data.registrantId, req.user);

      const result = await StudentOnboardingOrchestrator.processEnrollment(
        data.registrantId,
        data.unitId || '',
        processedById,
        {
          nis: data.nis,
          nisn: data.nisn,
          classId: data.classId || data.assignedClassId,
          assignedClassId: data.assignedClassId || data.classId,
          roomId: data.roomId,
          academicYearId: data.academicYearId,
        }
      );
      res.status(200).json(ApiResponse.success(result, 'Registrant onboarded successfully (E2E Integration complete)'));
    } catch (error: any) {
      next(error);
    }
  },
};

export default waveController;
