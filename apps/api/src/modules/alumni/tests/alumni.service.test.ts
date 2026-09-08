import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAlumni, getAlumniById, convertFromStudent } from '../alumni.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alumni: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('AlumniService — NISN/NIK projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should project nisn and nik onto alumni listings', async () => {
    vi.mocked(prisma.alumni.findMany).mockResolvedValue([
      {
        id: 'alumni-1',
        student: { id: 'student-1', nisn: '0012345678', nik: '3201000000000001' },
      },
    ] as any);
    vi.mocked(prisma.alumni.count).mockResolvedValue(1);

    const { data } = await getAlumni({ page: 1, limit: 10 });

    // The alumni projection must carry the student's nisn/nik so the client can
    // render a permanent identifier (NISN/NIK) rather than a legacy `nis`.
    expect(prisma.alumni.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          student: { select: { id: true, nisn: true, nik: true } },
        }),
      })
    );
    expect(data[0]?.student?.nisn).toBe('0012345678');
    expect(data[0]?.student?.nik).toBe('3201000000000001');
  });

  it('should project nisn and nik onto a single alumni detail', async () => {
    vi.mocked(prisma.alumni.findFirst).mockResolvedValue({
      id: 'alumni-1',
      student: { id: 'student-1', nisn: '0012345678', nik: null },
    } as any);

    const alumni = await getAlumniById('alumni-1');

    expect(prisma.alumni.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          student: { select: { id: true, nisn: true, nik: true } },
        }),
      })
    );
    expect(alumni?.student?.nisn).toBe('0012345678');
    expect(alumni?.student?.nik).toBeNull();
  });

  it('should preserve nisn/nik when converting a student to alumni', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: 'student-1',
      userId: 'user-1',
      unitId: 'unit-1',
      nisn: '0012345678',
      nik: '3201000000000001',
      gender: 'MALE',
      birthPlace: 'Jakarta',
      birthDate: new Date('2010-01-01'),
      parentPhone: '08123456789',
      parentEmail: null,
      address: 'Jl. Test',
      graduateYear: null,
      user: { name: 'Student 1', email: 's1@cipansor.local' },
    } as any);
    vi.mocked(prisma.alumni.count).mockResolvedValue(0);
    vi.mocked(prisma.alumni.create).mockResolvedValue({} as any);
    vi.mocked(prisma.student.update).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: 'alumni-1' }] as any);

    await convertFromStudent('student-1', { graduationYear: 2026 } as any);

    // The created alumni record must reference the student so its nisn/nik are
    // reachable and the client never falls back to a removed `nis` field.
    expect(prisma.alumni.create).toHaveBeenCalled();
    const createCall = vi.mocked(prisma.alumni.create).mock.calls[0][0] as any;
    expect(createCall.data.studentId).toBe('student-1');
    expect(createCall.include.student).toEqual({
      select: { id: true, nisn: true, nik: true },
    });
  });
});
