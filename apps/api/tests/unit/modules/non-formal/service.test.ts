import { describe, it, expect, vi, beforeEach } from 'vitest';
import { courseService } from '../../../../src/modules/non-formal/non-formal.service';
import { prisma } from '../../../../src/lib/prisma';

vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    course: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    courseEnrollment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentType: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('CourseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find all published courses', async () => {
    const mockCourses = [{ id: '1', name: 'Course 1', status: 'PUBLISHED' }];
    (prisma.course.findMany as any).mockResolvedValue(mockCourses);

    const result = await courseService.findAll();

    expect(result).toEqual(mockCourses);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED' },
      })
    );
  });

  it('should create a new course', async () => {
    const courseData = {
      unitId: 'unit-1',
      name: 'New Course',
      code: 'NC01',
      category: 'Tech',
      price: 100000,
    };
    (prisma.course.create as any).mockResolvedValue({ id: 'new-id', ...courseData });

    const result = await courseService.create(courseData as any);

    expect(result.id).toBe('new-id');
    expect(prisma.course.create).toHaveBeenCalled();
  });

  it('rejects enrollment when the course quota is full', async () => {
    (prisma.course.findUnique as any).mockResolvedValue({
      id: 'course-1',
      unitId: 'unit-1',
      name: 'Kursus Menjahit',
      maxParticipants: 2,
      _count: { enrollments: 2 },
      price: { gt: () => false },
    });

    await expect(
      courseService.enroll({ courseId: 'course-1', externalName: 'Peserta 3' } as any)
    ).rejects.toThrow('Kuota peserta kursus sudah penuh');
    expect(prisma.courseEnrollment.create).not.toHaveBeenCalled();
  });

  it('allows enrollment under quota and skips invoicing for free courses', async () => {
    (prisma.course.findUnique as any).mockResolvedValue({
      id: 'course-1',
      unitId: 'unit-1',
      name: 'Kursus Gratis',
      maxParticipants: 10,
      _count: { enrollments: 3 },
      price: { gt: () => false },
    });
    (prisma.courseEnrollment.create as any).mockResolvedValue({ id: 'enr-1' });

    const result = await courseService.enroll({
      courseId: 'course-1',
      externalName: 'Peserta Umum',
    } as any);

    expect(result).toEqual({ id: 'enr-1' });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});
