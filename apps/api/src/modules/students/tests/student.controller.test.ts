import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as controller from '../student.controller';
import { studentService } from '../student.service';

vi.mock('../student.service', () => ({
  studentService: {
    findInternalAlumniByIdentifier: vi.fn(),
    graduateStudent: vi.fn(),
  },
}));

describe('Student Controller — progression endpoints', () => {
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
      user: { role: 'ADMIN', roleCode: 'SUPER_ADMIN', unitId: 'unit-1', id: 'user-1' } as any,
    };
    res = { json, status, locals: {} };
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('lookupAlumni', () => {
    it('passes the identifier and the auth context to the service', async () => {
      const student = { id: 'alumni-1', nisn: '0123456789', status: 'alumni' };
      (studentService.findInternalAlumniByIdentifier as any).mockResolvedValue(student);

      req.query = { identifier: '0123456789' };
      await controller.lookupAlumni(req as Request, res as Response, next as any);

      expect(studentService.findInternalAlumniByIdentifier).toHaveBeenCalledWith('0123456789', {
        role: 'ADMIN',
        roleCode: 'SUPER_ADMIN',
        unitId: 'unit-1',
      });
      expect(json).toHaveBeenCalledWith({ success: true, data: student });
    });

    it('coerces a missing identifier to an empty string', async () => {
      (studentService.findInternalAlumniByIdentifier as any).mockResolvedValue(null);

      req.query = {};
      await controller.lookupAlumni(req as Request, res as Response, next as any);

      expect(studentService.findInternalAlumniByIdentifier).toHaveBeenCalledWith('', {
        role: 'ADMIN',
        roleCode: 'SUPER_ADMIN',
        unitId: 'unit-1',
      });
      expect(json).toHaveBeenCalledWith({ success: true, data: null });
    });
  });

  describe('graduate', () => {
    it('passes the validated body through to the service', async () => {
      const graduated = { id: 'stu-1', status: 'alumni' };
      (studentService.graduateStudent as any).mockResolvedValue(graduated);

      req.params = { id: 'stu-1' };
      req.body = { graduateYear: 2026, graduationDate: '2026-06-01T00:00:00.000Z' };
      await controller.graduate(req as Request, res as Response, next as any);

      expect(studentService.graduateStudent).toHaveBeenCalledWith('stu-1', {
        graduateYear: 2026,
        graduationDate: '2026-06-01T00:00:00.000Z',
      });
      expect(json).toHaveBeenCalledWith({
        success: true,
        data: graduated,
        message: 'Santri berhasil dinyatakan lulus',
      });
    });
  });
});
