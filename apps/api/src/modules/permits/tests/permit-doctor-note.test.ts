import { describe, it, expect, vi, beforeEach } from 'vitest';

// A doctor's note on a permit (decided 2026-09-28,
// decisions/pemutus-izin-santri.md): a child's health data, stored in the row
// and read only through `openDoctorNote` by whoever decides the permit, the
// unit head and the santri's wali — every opening audited — and erased when
// the academic year of the leave ends.

vi.mock('@/lib/prisma', () => {
  const prisma = {
    permit: { findFirst: vi.fn() },
    student: { findMany: vi.fn() },
    musyrifAssignment: { findMany: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    permitAttachment: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn((args) => ({ op: 'update', args })),
      updateMany: vi.fn((args) => ({ op: 'updateMany', args })),
    },
    auditLog: {
      create: vi.fn((args) => ({ op: 'audit', args })),
      createMany: vi.fn((args) => ({ op: 'auditMany', args })),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: typeof prisma) => unknown)(prisma) : arg
  );
  return { prisma };
});
vi.mock('../../notifications/notifications.service', () => ({
  createNotification: vi.fn(async () => ({})),
}));

import { prisma } from '@/lib/prisma';
import {
  attachDoctorNote,
  checkNote,
  erasePermitNotes,
  openDoctorNote,
  retainUntilFor,
} from '../permit-doctor-note.service';

const db = prisma as unknown as {
  permit: Record<string, ReturnType<typeof vi.fn>>;
  student: Record<string, ReturnType<typeof vi.fn>>;
  musyrifAssignment: Record<string, ReturnType<typeof vi.fn>>;
  academicYear: Record<string, ReturnType<typeof vi.fn>>;
  permitAttachment: Record<string, ReturnType<typeof vi.fn>>;
  auditLog: Record<string, ReturnType<typeof vi.fn>>;
};

const PERMIT_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '11111111-1111-4111-8111-111111111111';

const WALI = { sub: 'u-wali', roleCode: 'SMPIT_ORANG_TUA', unitId: 'unit-smp' };
const WALI_KELAS = { sub: 'u-walikelas', roleCode: 'SMPIT_GURU', unitId: 'unit-smp' };
const KEPALA = { sub: 'u-kepala', roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: 'unit-smp' };
const TU = { sub: 'u-tu', roleCode: 'SMPIT_TATA_USAHA', unitId: 'unit-smp' };
const GURU_LAIN = { sub: 'u-guru', roleCode: 'SMPIT_GURU', unitId: 'unit-smp' };
const FORMER_MENTOR = { sub: 'u-lama', roleCode: 'SMPIT_GURU', unitId: 'unit-smp' };

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.alloc(16),
]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');

const note = (extra: Record<string, unknown> = {}) => ({
  updatedAt: new Date('2026-09-28T02:00:00Z'),
  retainUntil: new Date('2027-06-30T00:00:00Z'),
  erasedAt: null,
  firstViewedAt: null,
  firstViewedBy: null,
  ...extra,
});

function permitRow(extra: Record<string, unknown> = {}) {
  return {
    id: PERMIT_ID,
    code: 'PMT-AB23CD',
    studentId: STUDENT_ID,
    type: 'SAKIT',
    reason: 'Demam tinggi sejak semalam',
    destination: null,
    startDate: new Date('2026-09-28T00:00:00Z'),
    endDate: new Date('2026-09-30T10:00:00Z'),
    status: 'PENDING',
    approvedAt: null,
    rejectionNote: null,
    departedAt: null,
    returnedAt: null,
    decidedAs: null,
    tookOver: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    student: {
      id: STUDENT_ID,
      nis: '2026001',
      photoUrl: null,
      unit: { id: 'unit-smp', name: 'SMP IT' },
      user: { id: 'u-student', name: 'Ahmad' },
    },
    approvedBy: null,
    doctorNote: null,
    ...extra,
  };
}

/** A day pupil whose wali kelas is u-walikelas. */
const DAY_PUPIL = {
  id: STUDENT_ID,
  unitId: 'unit-smp',
  unit: { type: 'SMP_IT' },
  roomAssignments: [],
  enrollments: [
    {
      class: {
        homeroomTeacher: { user: { id: 'u-walikelas', name: 'Ustadzah Fatimah', isActive: true } },
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.student.findMany.mockResolvedValue([DAY_PUPIL]);
  db.musyrifAssignment.findMany.mockResolvedValue([]);
  db.academicYear.findFirst.mockResolvedValue({ endDate: new Date('2027-06-30T00:00:00Z') });
});

describe('what a doctor’s note may be', () => {
  it.each([
    ['a JPEG photo', JPEG, 'image/jpeg'],
    ['a PNG', PNG, 'image/png'],
    ['a WebP', WEBP, 'image/webp'],
    ['a PDF', PDF, 'application/pdf'],
  ])('takes %s, read from its bytes', (_name, buffer, mimeType) => {
    const checked = checkNote({ buffer });
    expect(checked.mimeType).toBe(mimeType);
    expect(checked.sizeBytes).toBe(buffer.length);
    expect(checked.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses what only claims to be one — an executable renamed .jpg', () => {
    expect(() => checkNote({ buffer: Buffer.from('MZ\x90\x00 this is not an image') })).toThrow(
      /foto \(JPG, PNG, WebP\) atau PDF/
    );
  });

  it('refuses nothing, and anything over 5 MB', () => {
    expect(() => checkNote(undefined)).toThrow(/Unggah foto atau PDF/);
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]);
    expect(() => checkNote({ buffer: big })).toThrow(/5 MB/);
  });
});

describe('how long it is kept — to the end of the leave’s academic year', () => {
  it('is the last day of the academic year the leave starts in', async () => {
    db.academicYear.findFirst.mockResolvedValue({ endDate: new Date('2027-06-30T00:00:00Z') });
    const until = await retainUntilFor(new Date('2026-09-28T00:00:00Z'));
    expect(until.toISOString().slice(0, 10)).toBe('2027-06-30');
  });

  it('falls back to the next 30 June when no academic year covers the day', async () => {
    db.academicYear.findFirst.mockResolvedValue(null);
    expect((await retainUntilFor(new Date('2026-09-28T00:00:00Z'))).toISOString()).toMatch(
      /^2027-06-30/
    );
    expect((await retainUntilFor(new Date('2027-03-02T00:00:00Z'))).toISOString()).toMatch(
      /^2027-06-30/
    );
  });
});

describe('attaching it', () => {
  it('stores the file in the row with its facts, and audits the facts — never the file', async () => {
    db.permit.findFirst
      .mockResolvedValueOnce(permitRow())
      .mockResolvedValueOnce(permitRow({ doctorNote: note() }));
    const view = await attachDoctorNote(PERMIT_ID, { buffer: JPEG }, WALI);

    const upsert = db.permitAttachment.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ permitId: PERMIT_ID });
    expect(upsert.create).toMatchObject({
      permitId: PERMIT_ID,
      mimeType: 'image/jpeg',
      sizeBytes: JPEG.length,
      uploadedById: 'u-wali',
    });
    expect(upsert.create.retainUntil.toISOString()).toMatch(/^2027-06-30/);
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: 'CREATE',
      entity: 'PERMIT_DOCTOR_NOTE',
      entityId: PERMIT_ID,
    });
    expect(JSON.stringify(audit)).not.toContain('content');
    // The wali sent it and may open it; the permit now says one is attached.
    expect(view.doctorNote).toMatchObject({
      retainUntil: '2027-06-30',
      canOpen: true,
      erasedAt: null,
    });
  });

  it('a replacement is a new note: nobody has seen it, and it is whole again', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    await attachDoctorNote(PERMIT_ID, { buffer: PDF }, WALI);
    expect(db.permitAttachment.upsert.mock.calls[0][0].update).toMatchObject({
      mimeType: 'application/pdf',
      erasedAt: null,
      firstViewedById: null,
      firstViewedAt: null,
    });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('UPDATE');
  });

  it('lets only those who may open a note replace it — the TU attaches none over the wali’s', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    await expect(attachDoctorNote(PERMIT_ID, { buffer: JPEG }, TU)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(db.permitAttachment.upsert).not.toHaveBeenCalled();
    // …while the first note on a permit is anyone's to attach who may file it.
    db.permit.findFirst.mockResolvedValue(permitRow());
    await expect(attachDoctorNote(PERMIT_ID, { buffer: JPEG }, TU)).resolves.toBeDefined();
  });

  it.each(['REJECTED', 'CANCELLED', 'COMPLETED'])('refuses a %s permit: 409', async (status) => {
    db.permit.findFirst.mockResolvedValue(permitRow({ status }));
    await expect(attachDoctorNote(PERMIT_ID, { buffer: JPEG }, WALI)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.permitAttachment.upsert).not.toHaveBeenCalled();
  });
});

describe('opening it — the decider, the unit head, the wali; nobody else', () => {
  const stored = { content: new Uint8Array(JPEG), mimeType: 'image/jpeg', firstViewedById: null };

  it('gives the wali kelas who decides it the file, and names them as the first to see it', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    db.permitAttachment.findUnique.mockResolvedValue(stored);
    const file = await openDoctorNote(PERMIT_ID, WALI_KELAS);
    expect(file.mimeType).toBe('image/jpeg');
    expect(file.fileName).toBe('surat-dokter-PMT-AB23CD.jpg');
    expect(file.content.equals(JPEG)).toBe(true);
    expect(db.permitAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firstViewedById: 'u-walikelas' }),
      })
    );
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u-walikelas',
      action: 'READ',
      entity: 'PERMIT_DOCTOR_NOTE',
    });
  });

  it('gives the kepala sekolah the file (they may take the permit over)', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    db.permitAttachment.findUnique.mockResolvedValue(stored);
    await expect(openDoctorNote(PERMIT_ID, KEPALA)).resolves.toMatchObject({
      mimeType: 'image/jpeg',
    });
  });

  it('gives whoever decided it the file, though they are no longer the mentor', async () => {
    db.permit.findFirst.mockResolvedValue(
      permitRow({
        status: 'APPROVED',
        approvedBy: { id: 'u-lama', name: 'Ustadz Lama' },
        doctorNote: note(),
      })
    );
    db.permitAttachment.findUnique.mockResolvedValue(stored);
    await expect(openDoctorNote(PERMIT_ID, FORMER_MENTOR)).resolves.toBeDefined();
  });

  it('gives the wali the file without making them "the first to see it"', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    db.permitAttachment.findUnique.mockResolvedValue(stored);
    await openDoctorNote(PERMIT_ID, WALI);
    expect(db.permitAttachment.update).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u-wali',
      action: 'READ',
    });
  });

  it.each([
    ['the unit’s tata usaha', TU],
    ['another teacher of the unit', GURU_LAIN],
  ])('refuses %s: 403, and reads nothing', async (_who, actor) => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    await expect(openDoctorNote(PERMIT_ID, actor)).rejects.toMatchObject({ statusCode: 403 });
    expect(db.permitAttachment.findUnique).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('shows them that there is one, without the means to open it', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow({ doctorNote: note() }));
    db.permitAttachment.findUnique.mockResolvedValue(stored);
    // Read through the permit's own view: `canOpen` is false for the TU.
    const { getPermit } = await import('../permits.service');
    const view = await getPermit(PERMIT_ID, TU);
    expect(view.doctorNote).toMatchObject({ canOpen: false });
  });

  it('is a 404 on a permit without one, and once the file is erased', async () => {
    db.permit.findFirst.mockResolvedValue(permitRow());
    await expect(openDoctorNote(PERMIT_ID, WALI_KELAS)).rejects.toMatchObject({ statusCode: 404 });

    db.permit.findFirst.mockResolvedValue(
      permitRow({ doctorNote: note({ erasedAt: new Date('2027-07-01T18:15:00Z') }) })
    );
    db.permitAttachment.findUnique.mockResolvedValue({ ...stored, content: null });
    await expect(openDoctorNote(PERMIT_ID, WALI_KELAS)).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringMatching(/dihapus pada akhir tahun ajaran/),
    });
  });
});

describe('erasing it at the end of the academic year', () => {
  it('erases the file of every note past its last day, keeps the facts, and audits each', async () => {
    db.permitAttachment.findMany.mockResolvedValue([
      { id: 'n-1', permitId: 'p-1' },
      { id: 'n-2', permitId: 'p-2' },
    ]);
    const now = new Date('2027-07-01T18:15:00Z'); // 01:15 WIB on 2 July
    expect(await erasePermitNotes(now)).toBe(2);
    // Past its day in WIB: retainUntil before 2 July.
    expect(db.permitAttachment.findMany.mock.calls[0][0].where).toEqual({
      erasedAt: null,
      retainUntil: { lt: new Date('2027-07-02T00:00:00.000Z') },
    });
    expect(db.permitAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-1', 'n-2'] }, erasedAt: null },
      data: { content: null, erasedAt: now },
    });
    expect(db.auditLog.createMany.mock.calls[0][0].data).toEqual([
      { action: 'ERASE', entity: 'PERMIT_DOCTOR_NOTE', entityId: 'p-1' },
      { action: 'ERASE', entity: 'PERMIT_DOCTOR_NOTE', entityId: 'p-2' },
    ]);
  });

  it('does nothing while every note is within its year', async () => {
    db.permitAttachment.findMany.mockResolvedValue([]);
    expect(await erasePermitNotes(new Date('2027-06-30T10:00:00Z'))).toBe(0);
    expect(db.permitAttachment.updateMany).not.toHaveBeenCalled();
  });
});
