import { prisma } from '../../lib/prisma';
import { Prisma, Room, UnitType } from '@prisma/client';
import {
  CreateDormitoryDto,
  UpdateDormitoryDto,
  QueryDormitoryDto,
  CreateRoomDto,
  UpdateRoomDto,
  QueryRoomDto,
  CreateRoomAssignmentDto,
  UpdateRoomAssignmentDto,
  QueryRoomAssignmentDto,
} from './dormitories.schema';
import { Errors } from '../../middleware/error';
import { seesAllUnits } from '@/utils/resolve-unit-id';

// =====================================
// ROOM ACCESS
// =====================================

/**
 * Throws unless the user has a reason to see the santri inside this room.
 *
 * The check this replaces was `room.dormitory.unitId !== user.unitId` — it
 * asked who *owns the building*, which is a different question. An asrama
 * houses santri from every school: the seed alone puts SD IT, SMP IT and SMA
 * Qur'an santri into dormitories recorded under SMP IT, because
 * `Dormitory.unitId` can only name one unit and someone had to pick. So the
 * old check refused a musyrif the very kamar they supervise, and refused the
 * yayasan board outright (their unitId is null, and it matches nothing).
 *
 * It also protected nothing. `/rooms/:id/occupancy` carries the same role
 * guard, had no unit check at all, and returns the same roster — so the 403
 * turned away the people with a legitimate claim while the data stayed one
 * route away for everyone else. Both now come through here.
 *
 * The reasons, cheapest first:
 *   - foundation and boarding-wide roles see every unit by remit;
 *   - the unit that runs the asrama keeps its view of it;
 *   - a unit's staff may see a room that houses that unit's own santri;
 *   - a musyrif assigned to the room, or to its asrama, supervises it.
 *
 * The last one rarely fires today, because the boarding roleCodes short-circuit
 * on the first. It is here because an explicit assignment is the durable reason
 * — it holds for a guru registered as musyrif without a boarding roleCode, and
 * it does not depend on CROSS_UNIT_SCOPE_ROLES staying complete.
 *
 * Missing rooms are reported as 404 before any of this, matching the previous
 * behaviour: existence was never the secret being kept.
 */
export async function assertRoomAccess(
  user: {
    id: string;
    role?: string | null;
    roleCode?: string | null;
    unitId?: string | null;
  },
  roomId: string
): Promise<void> {
  if (seesAllUnits(user)) return;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      dormitoryId: true,
      dormitory: { select: { unitId: true } },
      assignments: {
        where: { isActive: true },
        select: { student: { select: { unitId: true } } },
      },
    },
  });
  if (!room) {
    throw Errors.notFound('Room not found');
  }

  if (user.unitId) {
    if (room.dormitory.unitId === user.unitId) return;
    if (room.assignments.some((a) => a.student.unitId === user.unitId)) return;
  }

  const supervises = await prisma.musyrifAssignment.findFirst({
    where: {
      isActive: true,
      musyrif: { userId: user.id },
      // A null roomId on the assignment means the whole asrama, which is how
      // getStudentsByMusyrif reads it too.
      OR: [{ roomId }, { roomId: null, dormitoryId: room.dormitoryId }],
    },
    select: { id: true },
  });
  if (supervises) return;

  throw Errors.forbidden('Access to this room is not allowed');
}

// =====================================
// DORMITORY SERVICE
// =====================================

/** The asrama code is unique across the yayasan, deleted asrama included. */
async function assertCodeFree(code: string, exceptId?: string) {
  const taken = await prisma.dormitory.findUnique({ where: { code }, select: { id: true } });
  if (taken && taken.id !== exceptId) {
    throw Errors.conflict(`Kode asrama ${code} sudah dipakai`);
  }
}

export async function createDormitory(data: CreateDormitoryDto) {
  await assertCodeFree(data.code);
  return prisma.dormitory.create({
    data,
    include: { unit: { select: { id: true, name: true } } },
  });
}

/**
 * How many santri live in each asrama now: the active placements in its active
 * kamar. The pages used to read a `currentOccupancy` the API never sent, so
 * every asrama showed 0 terisi.
 */
async function occupancyOf(dormitoryIds: string[]): Promise<Map<string, number>> {
  const rooms = await prisma.room.findMany({
    where: { dormitoryId: { in: dormitoryIds }, isActive: true },
    select: {
      dormitoryId: true,
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
  });
  const byDormitory = new Map<string, number>();
  for (const room of rooms) {
    byDormitory.set(
      room.dormitoryId,
      (byDormitory.get(room.dormitoryId) ?? 0) + room._count.assignments
    );
  }
  return byDormitory;
}

export async function getDormitories(query: QueryDormitoryDto) {
  const { unitId, gender, search, page, limit } = query;
  const skip = (page - 1) * limit;

  // Composed with AND because both the unit filter and the search need their
  // own OR; as sibling keys in one object the second would have replaced the
  // first, and searching within a unit would have quietly ignored the unit.
  const where: Prisma.DormitoryWhereInput = {
    deletedAt: null,
    ...(gender && { gender }),
    AND: [
      // "Asrama untuk unit X" is not `unitId = X`. The asrama is run at
      // foundation level and houses santri from several schools, so the useful
      // answer is: run by that unit, or lived in by that unit's santri.
      ...(unitId
        ? [
            {
              OR: [
                { unitId },
                {
                  rooms: {
                    some: {
                      assignments: { some: { isActive: true, student: { unitId } } },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { code: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [data, total] = await Promise.all([
    prisma.dormitory.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        _count: { select: { rooms: true } },
      },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    }),
    prisma.dormitory.count({ where }),
  ]);
  const occupancy = await occupancyOf(data.map((d) => d.id));

  return {
    data: data.map((d) => ({ ...d, occupancy: occupancy.get(d.id) ?? 0 })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDormitoryById(id: string) {
  const dormitory = await prisma.dormitory.findFirst({
    where: { id, deletedAt: null },
    include: {
      unit: { select: { id: true, name: true, type: true } },
      rooms: {
        where: { isActive: true },
        include: {
          _count: { select: { assignments: { where: { isActive: true } } } },
        },
        orderBy: [{ floor: 'asc' }, { name: 'asc' }],
      },
    },
  });
  if (!dormitory) return null;
  const occupancy = dormitory.rooms.reduce((n, room) => n + room._count.assignments, 0);
  return { ...dormitory, occupancy };
}

async function findLiveDormitory(id: string) {
  const dormitory = await prisma.dormitory.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, gender: true },
  });
  if (!dormitory) throw Errors.notFound('Asrama tidak ditemukan');
  return dormitory;
}

export async function updateDormitory(id: string, data: UpdateDormitoryDto) {
  const dormitory = await findLiveDormitory(id);
  if (data.code) await assertCodeFree(data.code, id);
  // Turning an asrama putra into putri with santri still in it would leave
  // every one of them in the wrong asrama; the placement rule is checked on
  // the way in, so it has to hold here too.
  if (data.gender && data.gender !== dormitory.gender) {
    const occupied = (await occupancyOf([id])).get(id) ?? 0;
    if (occupied > 0) {
      throw Errors.conflict(
        `Jenis asrama tidak bisa diubah selama ${occupied} santri masih tinggal di sini`
      );
    }
  }
  return prisma.dormitory.update({
    where: { id },
    data,
    include: { unit: { select: { id: true, name: true } } },
  });
}

/**
 * Soft delete. An asrama that still houses santri cannot go: they would keep
 * a bed in a building nobody can open.
 */
export async function deleteDormitory(id: string) {
  await findLiveDormitory(id);
  const occupied = (await occupancyOf([id])).get(id) ?? 0;
  if (occupied > 0) {
    throw Errors.conflict(
      `Asrama masih dihuni ${occupied} santri; pindahkan atau keluarkan mereka dulu`
    );
  }
  return prisma.dormitory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// =====================================
// ROOM SERVICE
// =====================================

/**
 * What a placement needs to say about the santri. `include: { student }` sent
 * the whole student row — the child's personal data, far beyond a name and a
 * NIS — to every teacher who can read an asrama.
 */
const PLACED_STUDENT = {
  select: {
    id: true,
    nis: true,
    gender: true,
    user: { select: { id: true, name: true } },
  },
} as const;

const ROOM_DORMITORY = { dormitory: { select: { id: true, name: true, code: true } } } as const;

/**
 * A kamar name is unique within its asrama, deactivated kamar included
 * (`@@unique([dormitoryId, name])`). Re-adding a kamar that was deleted
 * therefore brings the old row back with the new figures, rather than failing
 * on a name nobody can see any more.
 */
export async function createRoom(data: CreateRoomDto) {
  await findLiveDormitory(data.dormitoryId);
  const existing = await prisma.room.findUnique({
    where: { dormitoryId_name: { dormitoryId: data.dormitoryId, name: data.name } },
    select: { id: true, isActive: true },
  });
  if (existing?.isActive) {
    throw Errors.conflict(`${data.name} sudah ada di asrama ini`);
  }
  if (existing) {
    const { dormitoryId: _dormitoryId, ...figures } = data;
    return prisma.room.update({
      where: { id: existing.id },
      data: { ...figures, isActive: true },
      include: ROOM_DORMITORY,
    });
  }
  return prisma.room.create({ data, include: ROOM_DORMITORY });
}

export async function getRooms(query: QueryRoomDto) {
  const { dormitoryId, floor, isActive, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(dormitoryId && { dormitoryId }),
    ...(floor && { floor }),
    ...(isActive !== undefined && { isActive }),
  };

  const [data, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: {
        dormitory: { select: { id: true, name: true, code: true, gender: true } },
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.room.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRoomById(id: string) {
  return prisma.room.findUnique({
    where: { id },
    include: {
      dormitory: { select: { id: true, name: true, code: true, gender: true } },
      assignments: {
        where: { isActive: true },
        include: {
          student: PLACED_STUDENT,
        },
        orderBy: { assignedAt: 'desc' },
      },
    },
  });
}

async function findRoomWithOccupancy(id: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      dormitoryId: true,
      capacity: true,
      isActive: true,
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
  });
  if (!room) throw Errors.notFound('Kamar tidak ditemukan');
  return { ...room, occupied: room._count.assignments };
}

export async function updateRoom(id: string, data: UpdateRoomDto) {
  const room = await findRoomWithOccupancy(id);
  if (data.capacity !== undefined && data.capacity < room.occupied) {
    throw Errors.conflict(
      `${room.name} dihuni ${room.occupied} santri; kapasitasnya tidak bisa kurang dari itu`
    );
  }
  if (data.isActive === false && room.occupied > 0) {
    throw Errors.conflict(`${room.name} masih dihuni ${room.occupied} santri`);
  }
  if (data.name && data.name !== room.name) {
    const clash = await prisma.room.findUnique({
      where: { dormitoryId_name: { dormitoryId: room.dormitoryId, name: data.name } },
      select: { id: true },
    });
    if (clash) throw Errors.conflict(`${data.name} sudah ada di asrama ini`);
  }
  return prisma.room.update({ where: { id }, data, include: ROOM_DORMITORY });
}

/**
 * Soft delete by deactivating. A kamar with santri in it cannot go — the
 * santri would hold a bed in a kamar no list shows — and whoever was assigned
 * to look after this kamar stops being its musyrif with it.
 */
export async function deleteRoom(id: string) {
  const room = await findRoomWithOccupancy(id);
  if (room.occupied > 0) {
    throw Errors.conflict(
      `${room.name} masih dihuni ${room.occupied} santri; keluarkan atau pindahkan mereka dulu`
    );
  }
  const now = new Date();
  const [deactivated] = await prisma.$transaction([
    prisma.room.update({ where: { id }, data: { isActive: false } }),
    prisma.musyrifAssignment.updateMany({
      where: { roomId: id, isActive: true },
      data: { isActive: false, endDate: now },
    }),
  ]);
  return deactivated;
}

// =====================================
// ROOM ASSIGNMENT SERVICE
// =====================================

/**
 * Whether a unit's santri board, which at Cipansor depends on the stage.
 *
 * - TK Qur'an: never. The pupils are far too young; they go home daily.
 * - SD IT: some board, some do not. Both are normal.
 * - SMP IT and SMA Qur'an: boarding is compulsory, so a santri there without
 *   an active bed is a gap in the data rather than a santri who lives at home.
 *
 * Nothing encoded this, and an older seed left a TK santri holding a bed in
 * Asrama Putri Al-Hikmah. That stayed invisible while facility counts read
 * `dormitory.unitId`; now that they read occupancy, TK Qur'an would have
 * reported an asrama it does not have.
 *
 * OTHER is OPTIONAL rather than NONE deliberately: the foundation has not
 * said, and refusing something it never forbade would be the worse guess — a
 * future unit type then needs no code change.
 */
export type BoardingPolicy = 'NONE' | 'OPTIONAL' | 'MANDATORY';

export const BOARDING_POLICY: Record<UnitType, BoardingPolicy> = {
  [UnitType.TK_QURAN]: 'NONE',
  [UnitType.SD_IT]: 'OPTIONAL',
  [UnitType.SMP_IT]: 'MANDATORY',
  [UnitType.SMA_QURAN]: 'MANDATORY',
  [UnitType.PESANTREN]: 'MANDATORY',
  // Kantin, laundry, koperasi — no santri of their own.
  [UnitType.UNIT_USAHA]: 'NONE',
  [UnitType.OTHER]: 'OPTIONAL',
};

export async function createRoomAssignment(data: CreateRoomAssignmentDto) {
  // Who may sleep here was never checked: any studentId and any roomId were
  // accepted, so a TK santri could hold a bed and a santriwati could be placed
  // in the asrama putra. Both are caught here rather than in the UI, which is
  // not the only caller.
  const [student, room] = await Promise.all([
    prisma.student.findFirst({
      where: { id: data.studentId, deletedAt: null },
      select: { gender: true, unit: { select: { name: true, type: true } } },
    }),
    prisma.room.findUnique({
      where: { id: data.roomId },
      select: {
        name: true,
        capacity: true,
        isActive: true,
        dormitory: { select: { name: true, gender: true, deletedAt: true } },
        assignments: { where: { isActive: true }, select: { studentId: true } },
      },
    }),
  ]);

  if (!student) {
    throw Errors.notFound('Santri tidak ditemukan');
  }
  if (!room || !room.isActive || room.dormitory.deletedAt) {
    throw Errors.notFound('Kamar tidak ditemukan');
  }
  if (room.assignments.some((a) => a.studentId === data.studentId)) {
    throw Errors.conflict(`Santri ini sudah menempati ${room.name}`);
  }
  // Capacity was never checked: a kamar for four took a fifth, a sixth, ...
  if (room.assignments.length >= room.capacity) {
    throw Errors.conflict(`${room.name} sudah penuh (${room.capacity} santri)`);
  }
  if (BOARDING_POLICY[student.unit.type] === 'NONE') {
    throw Errors.badRequest(`Santri ${student.unit.name} tidak menginap di asrama`);
  }
  if (room.dormitory.gender !== student.gender) {
    throw Errors.badRequest(`${room.dormitory.name} tidak sesuai dengan jenis kelamin santri`);
  }

  // A santri sleeps in one kamar: placing them ends the placement they had,
  // in the same transaction, so a failure leaves them where they were.
  const [, assignment] = await prisma.$transaction([
    prisma.roomAssignment.updateMany({
      where: { studentId: data.studentId, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    }),
    prisma.roomAssignment.create({
      data,
      include: {
        room: { include: ROOM_DORMITORY },
        student: PLACED_STUDENT,
      },
    }),
  ]);
  return assignment;
}

export async function getRoomAssignments(query: QueryRoomAssignmentDto) {
  const { roomId, studentId, isActive, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(roomId && { roomId }),
    ...(studentId && { studentId }),
    ...(isActive !== undefined && { isActive }),
  };

  const [data, total] = await Promise.all([
    prisma.roomAssignment.findMany({
      where,
      include: {
        room: {
          include: {
            dormitory: { select: { id: true, name: true, code: true } },
          },
        },
        student: PLACED_STUDENT,
      },
      orderBy: { assignedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.roomAssignment.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRoomAssignmentById(id: string) {
  return prisma.roomAssignment.findUnique({
    where: { id },
    include: { room: { include: ROOM_DORMITORY }, student: PLACED_STUDENT },
  });
}

export async function updateRoomAssignment(id: string, data: UpdateRoomAssignmentDto) {
  return prisma.roomAssignment.update({
    where: { id },
    data,
    include: { room: { include: ROOM_DORMITORY }, student: PLACED_STUDENT },
  });
}

/** Ends an active placement; ending one twice would rewrite when it ended. */
export async function endRoomAssignment(id: string) {
  const { count } = await prisma.roomAssignment.updateMany({
    where: { id, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });
  if (count === 0) {
    const exists = await prisma.roomAssignment.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw Errors.notFound('Penempatan tidak ditemukan');
    throw Errors.conflict('Santri ini sudah dikeluarkan dari kamarnya');
  }
}

export async function getStudentsByMusyrif(userId: string) {
  // 1. Get Musyrif profile
  const musyrif = await prisma.musyrif.findFirst({
    where: { userId },
    include: {
      assignments: {
        where: { isActive: true },
      },
    },
  });

  if (!musyrif) {
    return [];
  }

  // 2. Collect scope
  const dormitoryIds = musyrif.assignments.filter((a) => !a.roomId).map((a) => a.dormitoryId);

  const roomIds = musyrif.assignments.filter((a) => a.roomId).map((a) => a.roomId as string);

  // 3. Find students
  const roomAssignments = await prisma.roomAssignment.findMany({
    where: {
      isActive: true,
      room: {
        OR: [{ id: { in: roomIds } }, { dormitoryId: { in: dormitoryIds } }],
      },
    },
    include: {
      room: { select: { name: true } },
      student: {
        include: {
          user: { select: { name: true, email: true } },
          enrollments: {
            where: { status: 'active' },
            include: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      student: { user: { name: 'asc' } },
    },
  });

  return roomAssignments.map((ra) => ({
    id: ra.student.id,
    name: ra.student.user.name,
    nis: ra.student.nis,
    photo: ra.student.photoUrl,
    class: ra.student.enrollments[0]?.class.name || '-',
    room: ra.room.name,
    gender: ra.student.gender,
  }));
}

// =====================================
// HELPER FUNCTIONS
// =====================================

export async function getRoomOccupancy(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
  });

  if (!room) return null;

  return {
    roomId: room.id,
    roomName: room.name,
    capacity: room.capacity,
    occupied: room._count.assignments,
    available: room.capacity - room._count.assignments,
  };
}

export async function getRoomSocialAnalytics(roomId: string) {
  // Only consider violations from the last 6 months for current room dynamics
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      assignments: {
        where: { isActive: true },
        include: {
          student: {
            include: {
              user: { select: { id: true, name: true } },
              violations: {
                where: { occurredAt: { gte: sixMonthsAgo } },
                orderBy: { createdAt: 'desc' },
                take: 50, // Limit per student to prevent excessive memory usage
              },
              medicalRecords: {
                select: { id: true },
                orderBy: { visitDate: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!room) return null;

  const members = room.assignments.map((a) => {
    const s = a.student;
    const violationPoints = s.violations.reduce((sum, v) => sum + Number(v.points), 0);

    return {
      studentId: s.id,
      name: s.user?.name,
      riskScore: violationPoints,
      lastHealthStatus: s.medicalRecords.length > 0 ? 'Tercatat' : 'Sehat',
      recentViolations: s.violations.length,
    };
  });

  // Calculate room harmony score (simplified)
  // Higher violations = lower harmony.
  // Use a logarithmic-inspired scale so a single high-violation member
  // doesn't crash the score to 0 for the entire room.
  const totalViolations = members.reduce((sum, m) => sum + m.riskScore, 0);
  const avgViolationPoints = totalViolations / Math.max(1, members.length);
  // Scale: 0 pts → 100, ~10 pts → ~82, ~50 pts → ~37, ~100 pts → ~14, ~250+ pts → ~0
  const harmonyScore =
    Math.round(Math.max(0, 100 * Math.exp(-avgViolationPoints / 50)) * 100) / 100;

  // Enhanced: Detect "Murojaah Social Contagion" (Positive peer influence)
  // If many members have high tahfidz progress, it boosts the room status.
  const topMemorizers = room.assignments.filter(
    (a) => (a.student as any).tahfidzRecords?.length > 10
  ).length;
  const peerInfluenceBonus = Math.min(10, topMemorizers * 2);

  const finalHarmonyScore = Math.min(100, harmonyScore + peerInfluenceBonus);

  return {
    roomId,
    roomName: room.name,
    harmonyScore: finalHarmonyScore,
    members,
    status:
      finalHarmonyScore > 80
        ? 'KONDUSIF'
        : finalHarmonyScore > 50
          ? 'PERLU_PENGAWASAN'
          : 'RAWAN_KONFLIK',
  };
}

export async function getDormitoryStats(dormitoryId: string) {
  const dormitory = await prisma.dormitory.findUnique({
    where: { id: dormitoryId },
    include: {
      rooms: {
        include: {
          _count: { select: { assignments: { where: { isActive: true } } } },
        },
      },
    },
  });

  if (!dormitory) return null;

  type RoomWithCount = Room & { _count: { assignments: number } };
  const rooms = dormitory.rooms as RoomWithCount[];

  const totalRooms = rooms.length;
  const activeRooms = rooms.filter((r) => r.isActive).length;
  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  const totalOccupied = rooms.reduce((sum, r) => sum + r._count.assignments, 0);

  return {
    dormitoryId: dormitory.id,
    dormitoryName: dormitory.name,
    totalRooms,
    activeRooms,
    totalCapacity,
    totalOccupied,
    availableSpots: totalCapacity - totalOccupied,
    occupancyRate: totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0,
  };
}
