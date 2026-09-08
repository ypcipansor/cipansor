import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  assertRoomAccess,
  createRoomAssignment,
  getStudentsByMusyrif,
} from '../../../../src/modules/dormitories/dormitories.service';
import { prisma } from '../../../../src/lib/prisma';

// Mock dependencies
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    musyrif: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    musyrifAssignment: {
      findFirst: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    roomAssignment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('DormitoryService', () => {
  describe('getStudentsByMusyrif', () => {
    const mockUserId = 'user-123';

    it('should return empty list if musyrif not found', async () => {
      vi.mocked(prisma.musyrif.findFirst).mockResolvedValue(null);

      const result = await getStudentsByMusyrif(mockUserId);

      expect(result).toEqual([]);
      expect(prisma.musyrif.findFirst).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: { assignments: { where: { isActive: true } } },
      });
    });

    it('should return students for assigned rooms and dormitories', async () => {
      const mockMusyrif = {
        id: 'musyrif-1',
        assignments: [
          { dormitoryId: 'dorm-1', roomId: null }, // Assign entire dorm
          { dormitoryId: 'dorm-2', roomId: 'room-2' }, // Assign specific room
        ],
      };

      const mockRoomAssignments = [
        {
          student: {
            id: 'student-1',
            nisn: '12345',
            gender: 'MALE',
            photoUrl: 'pic.jpg',
            user: { name: 'Ahmad', email: 'ahmad@example.com' },
            enrollments: [{ class: { name: '10 A' } }],
          },
          room: { name: 'Room 101' },
        },
        {
          student: {
            id: 'student-2',
            nisn: '67890',
            gender: 'MALE',
            photoUrl: null,
            user: { name: 'Budi', email: 'budi@example.com' },
            enrollments: [],
          },
          room: { name: 'Room 102' },
        },
      ];

      vi.mocked(prisma.musyrif.findFirst).mockResolvedValue(mockMusyrif as any);
      vi.mocked(prisma.roomAssignment.findMany).mockResolvedValue(mockRoomAssignments as any);

      const result = await getStudentsByMusyrif(mockUserId);

      expect(prisma.roomAssignment.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          room: {
            OR: [{ id: { in: ['room-2'] } }, { dormitoryId: { in: ['dorm-1'] } }],
          },
        },
        include: expect.any(Object),
        orderBy: expect.any(Object),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'student-1',
        name: 'Ahmad',
        nisn: '12345',
        nik: undefined,
        photo: 'pic.jpg',
        class: '10 A',
        room: 'Room 101',
        gender: 'MALE',
      });
      expect(result[1]).toEqual({
        id: 'student-2',
        name: 'Budi',
        nisn: '67890',
        nik: undefined,
        photo: null,
        class: '-',
        room: 'Room 102',
        gender: 'MALE',
      });
    });
  });

  /**
   * The point of these: an asrama holds santri from several schools, so
   * "which unit owns the building" is not the question that decides access.
   */
  describe('assertRoomAccess', () => {
    const ROOM_ID = 'room-1';

    beforeEach(() => {
      vi.mocked(prisma.room.findUnique).mockReset();
      vi.mocked(prisma.musyrifAssignment.findFirst).mockReset();
    });

    /** A room in SMP IT's asrama, occupied by one SD IT santri. */
    const mockRoom = (occupantUnitIds: string[] = ['unit-sdit']) =>
      vi.mocked(prisma.room.findUnique).mockResolvedValue({
        dormitoryId: 'dorm-1',
        dormitory: { unitId: 'unit-smpit' },
        assignments: occupantUnitIds.map((unitId) => ({ student: { unitId } })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    it('lets a foundation role through without reading the room', async () => {
      await expect(
        assertRoomAccess({ id: 'u1', roleCode: RoleCode.YAYASAN_KETUA, unitId: null }, ROOM_ID)
      ).resolves.toBeUndefined();

      expect(prisma.room.findUnique).not.toHaveBeenCalled();
    });

    it('lets the unit that runs the asrama through', async () => {
      mockRoom();

      await expect(
        assertRoomAccess({ id: 'u2', roleCode: RoleCode.SMPIT_GURU, unitId: 'unit-smpit' }, ROOM_ID)
      ).resolves.toBeUndefined();
    });

    // The case the old `dormitory.unitId !== user.unitId` check got wrong.
    it("lets a unit through when the room houses that unit's santri", async () => {
      mockRoom(['unit-sdit']);

      await expect(
        assertRoomAccess({ id: 'u3', roleCode: RoleCode.SDIT_GURU, unitId: 'unit-sdit' }, ROOM_ID)
      ).resolves.toBeUndefined();

      expect(prisma.musyrifAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('lets an assigned musyrif through even with no unit claim on the room', async () => {
      mockRoom(['unit-smpit']);
      vi.mocked(prisma.musyrifAssignment.findFirst).mockResolvedValue({
        id: 'ma-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await expect(
        assertRoomAccess({ id: 'u4', roleCode: RoleCode.SMAQ_GURU, unitId: 'unit-smaq' }, ROOM_ID)
      ).resolves.toBeUndefined();
    });

    it('refuses a unit with no santri in the room and no assignment', async () => {
      mockRoom(['unit-smpit']);
      vi.mocked(prisma.musyrifAssignment.findFirst).mockResolvedValue(null);

      await expect(
        assertRoomAccess({ id: 'u5', roleCode: RoleCode.SMAQ_GURU, unitId: 'unit-smaq' }, ROOM_ID)
      ).rejects.toThrow(/not allowed/i);
    });

    it('reports a missing room as not found, not as forbidden', async () => {
      vi.mocked(prisma.room.findUnique).mockResolvedValue(null);

      await expect(
        assertRoomAccess({ id: 'u6', roleCode: RoleCode.SMAQ_GURU, unitId: 'unit-smaq' }, ROOM_ID)
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('createRoomAssignment', () => {
    const payload = { studentId: 'student-1', roomId: 'room-1' };

    const mockPair = (studentUnitType: string, studentGender: string, dormGender: string) => {
      vi.mocked(prisma.student.findUnique).mockResolvedValue({
        gender: studentGender,
        unit: { name: 'Unit Uji', type: studentUnitType },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(prisma.room.findUnique).mockResolvedValue({
        dormitory: { name: 'Asrama Putri Al-Hikmah', gender: dormGender },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    };

    beforeEach(() => {
      vi.mocked(prisma.roomAssignment.updateMany).mockResolvedValue({
        count: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.roomAssignment.create).mockResolvedValue({} as any);
    });

    // The row an older seed left behind: a TK santri holding a bed. TK pupils
    // go home daily; SD IT is mixed, SMP/SMA board without exception.
    it('refuses a santri from a unit that does not board', async () => {
      mockPair('TK_QURAN', 'FEMALE', 'FEMALE');

      await expect(createRoomAssignment(payload as never)).rejects.toThrow(
        /tidak menginap di asrama/i
      );
      expect(prisma.roomAssignment.create).not.toHaveBeenCalled();
    });

    it('refuses a santri whose gender does not match the asrama', async () => {
      mockPair('SMP_IT', 'MALE', 'FEMALE');

      await expect(createRoomAssignment(payload as never)).rejects.toThrow(/jenis kelamin/i);
      expect(prisma.roomAssignment.create).not.toHaveBeenCalled();
    });

    it('accepts a boarding santri in a matching asrama', async () => {
      mockPair('SD_IT', 'FEMALE', 'FEMALE');

      await createRoomAssignment(payload as never);

      // Any previous bed is released before the new one is taken.
      expect(prisma.roomAssignment.updateMany).toHaveBeenCalledWith({
        where: { studentId: 'student-1', isActive: true },
        data: { isActive: false, endedAt: expect.any(Date) },
      });
      expect(prisma.roomAssignment.create).toHaveBeenCalled();
    });
  });
});
