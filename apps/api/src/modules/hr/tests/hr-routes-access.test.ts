import { describe, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

/**
 * Governance oversight vs HR administration.
 *
 * `ADMIN_ROLES` used to expand to `ADMIN_ROLE_CODES + GOVERNANCE_ROLE_CODES`,
 * so every governance role (pembina, pengawas, treasurer, …) could *write*
 * attendance, approve leave, and edit contracts/departments through the HR
 * module. Oversight means reading personnel data, not administering it —
 * `GOVERNANCE_ROLE_CODES`' own doc says it is "deliberately NOT system
 * administrators". These tests pin the boundary at the router: a governance
 * role reads (200) but a write is refused (403), while a unit admin may do
 * both. The controllers/services are mocked so only `authorize` is under test.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/middleware/auth')>();
  return {
    ...actual,
    authenticate: (req: Request, _res: Response, next: NextFunction) => {
      const roleCode = String(req.headers['x-peran'] ?? '');
      req.user = {
        id: 'u-hr-test',
        roleCode,
        role: actual.deriveLegacyRole(roleCode),
        unitId: null,
      } as unknown as Request['user'];
      next();
    },
  };
});

// The route validates queries with its own schemas; permissive stand-ins let
// the request reach the handler without coupling this test to felt schemas.
vi.mock('../hr.schema', async () => {
  const { z } = await import('zod');
  const passthrough = z.object({}).passthrough();
  return {
    queryEmployeesSchema: passthrough,
    queryStaffSchema: passthrough,
    queryTeachersSchema: passthrough,
    queryLeaveSchema: passthrough,
    queryStaffAttendanceSchema: passthrough,
  };
});

const makeHandler = vi.hoisted(
  () => (_req: Request, res: Response) => res.status(200).json({ success: true })
);

// The router reads `hr.controller` as a namespace import; every name it
// references must exist on the mock, so they are listed explicitly.
const hrControllerMock = vi.hoisted(() => {
  const ok = (_req: Request, res: Response) => res.status(200).json({ success: true });
  return {
    getEmployees: ok,
    getEmployeeById: ok,
    getStaffList: ok,
    getStaffById: ok,
    getTeachers: ok,
    getStaffAttendance: ok,
    getStaffAttendanceById: ok,
    createStaffAttendance: ok,
    updateStaffAttendance: ok,
    deleteStaffAttendance: ok,
    recordBulkAttendance: ok,
    getStaffAttendanceSummary: ok,
    getRetentionRisk: ok,
    getLeaves: ok,
    getLeaveById: ok,
    createLeave: ok,
    updateLeave: ok,
    approveLeave: ok,
    cancelLeave: ok,
    deleteLeave: ok,
    getLeaveBalance: ok,
  };
});

vi.mock('../hr.controller', () => hrControllerMock);
vi.mock('../departments.controller', () => ({
  departmentController: {
    create: makeHandler,
    findAll: makeHandler,
    findOne: makeHandler,
    update: makeHandler,
    delete: makeHandler,
  },
}));
vi.mock('../contracts.controller', () => ({
  contractController: {
    create: makeHandler,
    findAll: makeHandler,
    getExpiring: makeHandler,
    findByUser: makeHandler,
    update: makeHandler,
  },
}));
vi.mock('../leave-balances.controller', () => ({
  leaveBalanceController: {
    getBalances: makeHandler,
    initialize: makeHandler,
    update: makeHandler,
  },
}));
vi.mock('../employee-documents.controller', () => ({
  employeeDocumentController: { findAll: makeHandler, create: makeHandler, delete: makeHandler },
}));
vi.mock('../employment-history.controller', () => ({
  employmentHistoryController: { findAll: makeHandler, create: makeHandler },
}));
vi.mock('@/utils/cloud-storage', () => ({
  uploadToCloudStorage: vi.fn(),
  deleteFromCloudStorage: vi.fn(),
}));

import router from '../hr.routes';
import { errorHandler } from '@/middleware/error';

const app = express();
app.use(express.json());
app.use('/api/hr', router);
app.use(errorHandler);

const UNIT_ADMIN = 'SDIT_ADMIN';
const GOVERNANCE = 'YAYASAN_PEMBINA';

function as(role: string) {
  return { 'x-peran': role };
}

describe('HR route access — governance oversight vs administration', () => {
  it('lets a governance role READ the directory, attendance and contracts', async () => {
    await request(app).get('/api/hr/employees').set(as(GOVERNANCE)).expect(200);
    await request(app).get('/api/hr/attendance').set(as(GOVERNANCE)).expect(200);
    await request(app).get('/api/hr/contracts').set(as(GOVERNANCE)).expect(200);
  });

  it('refuses a governance role the WRITE routes', async () => {
    await request(app).post('/api/hr/attendance').set(as(GOVERNANCE)).expect(403);
    await request(app).put('/api/hr/attendance/abc').set(as(GOVERNANCE)).expect(403);
    await request(app).delete('/api/hr/attendance/abc').set(as(GOVERNANCE)).expect(403);
    await request(app).patch('/api/hr/leaves/abc/approve').set(as(GOVERNANCE)).expect(403);
    await request(app).post('/api/hr/departments').set(as(GOVERNANCE)).expect(403);
    await request(app).patch('/api/hr/departments/abc').set(as(GOVERNANCE)).expect(403);
    await request(app).delete('/api/hr/departments/abc').set(as(GOVERNANCE)).expect(403);
    await request(app).post('/api/hr/contracts').set(as(GOVERNANCE)).expect(403);
    await request(app).patch('/api/hr/contracts/abc').set(as(GOVERNANCE)).expect(403);
    await request(app).post('/api/hr/documents').set(as(GOVERNANCE)).expect(403);
    await request(app).delete('/api/hr/documents/abc').set(as(GOVERNANCE)).expect(403);
    await request(app).post('/api/hr/history').set(as(GOVERNANCE)).expect(403);
    await request(app).post('/api/hr/leave-balances/initialize').set(as(GOVERNANCE)).expect(403);
  });

  it('lets a unit admin do both reads and writes', async () => {
    await request(app).get('/api/hr/employees').set(as(UNIT_ADMIN)).expect(200);
    await request(app).post('/api/hr/attendance').set(as(UNIT_ADMIN)).expect(200);
    await request(app).patch('/api/hr/leaves/abc/approve').set(as(UNIT_ADMIN)).expect(200);
    await request(app).post('/api/hr/contracts').set(as(UNIT_ADMIN)).expect(200);
  });
});
