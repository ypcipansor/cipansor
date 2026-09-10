import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as controller from '../../../../src/modules/classes/class.controller';
import { classService } from '../../../../src/modules/classes/class.service';
import { Gender } from '@cipansor/shared';

// Mock dependencies
vi.mock('../../../../src/modules/classes/class.service', () => ({
  classService: {
    getEnrollments: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    enrollStudent: vi.fn(),
    updateEnrollment: vi.fn(),
    removeStudent: vi.fn(),
  },
}));

describe('Class Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: any;
  let json: any;
  let status: any;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn().mockReturnValue({ json });
    req = {
      params: {},
      query: {},
      body: {},
      user: { role: 'ADMIN', unitId: 'unit-id', id: 'user-id' } as any,
    };
    res = {
      json,
      status,
      locals: {},
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('getEnrollments', () => {
    it('should return enrollments for a class', async () => {
      req.params = { id: 'class-id' };
      const enrollments = [
        {
          id: 'enrollment-id',
          studentId: 'student-id',
          classId: 'class-id',
          status: 'active',
          student: {
            id: 'student-id',
            nisn: '12345',
            gender: Gender.MALE,
            user: {
              id: 'user-id',
              name: 'Student Name',
              email: 'student@example.com',
            },
          },
          enrolledAt: new Date(),
        },
      ];

      (classService.getEnrollments as any).mockResolvedValue(enrollments);

      await controller.getEnrollments(req as Request, res as Response, next);

      expect(classService.getEnrollments).toHaveBeenCalledWith('class-id');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: enrollments,
      });
    });

    it('should handle errors', async () => {
      req.params = { id: 'class-id' };
      const error = new Error('Database error');
      (classService.getEnrollments as any).mockRejectedValue(error);

      await controller.getEnrollments(req as Request, res as Response, next);

      // Wait for async handler to catch error
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
