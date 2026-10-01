import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define mocks
const db = vi.hoisted(() => {
  const user = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const teacher = {
    create: vi.fn(),
    update: vi.fn(),
  };
  const staff = {
    create: vi.fn(),
    update: vi.fn(),
  };

  const client: any = {
    user,
    teacher,
    staff,
    $disconnect: vi.fn(),
    $connect: vi.fn(),
  };

  client.$transaction = vi.fn((callback: any) => callback(client));

  return client;
});

// Mock @prisma/client to return our hoisted mock when instantiated
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    ...actual,
    // Return a class implementation
    PrismaClient: class {
      constructor() {
        return db;
      }
    },
  };
});

// Import service after mocks
import { createEmployee } from '../../../../src/modules/hr/hr.service';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashedPassword'),
  },
}));

describe('HR Employee Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset transaction implementation
    db.$transaction.mockImplementation((callback: any) => callback(db));
  });

  it('should create a Teacher employee successfully', async () => {
    // Arrange
    const input = {
      name: 'John Doe',
      email: 'john@example.com',
      unitId: 'unit-1',
      role: 'TEACHER' as const,
      gender: 'MALE' as const,
      nip: '12345',
      nuptk: '98765',
      religion: 'ISLAM',
    };

    const mockUser = {
      id: 'user-1',
      ...input,
    };

    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(mockUser);
    db.staff.create.mockResolvedValue({ id: 'staff-1', userId: 'user-1' });
    db.teacher.create.mockResolvedValue({ id: 'teacher-1', userId: 'user-1' });

    // Act
    const result = await createEmployee(input);

    // Assert
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: input.email } });

    // Updated assertion to match Prisma's call structure (args wrapped in data property)
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: input.name,
        role: 'TEACHER',
      }),
    });

    // A teacher must get a Staff row too — attendance, leave and payroll key on
    // Staff — and the Teacher row links back to it.
    expect(db.staff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        unitId: 'unit-1',
      }),
    });

    expect(db.teacher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        staffId: 'staff-1',
        nuptk: input.nuptk,
      }),
    });

    expect(result).toEqual(mockUser);
  });

  it('should create a Staff employee successfully', async () => {
    // Arrange
    const input = {
      name: 'Jane Smith',
      email: 'jane@example.com',
      unitId: 'unit-1',
      role: 'STAFF' as const,
      gender: 'FEMALE' as const,
      nip: '54321',
      position: 'Admin',
      department: 'HR',
    };

    const mockUser = {
      id: 'user-2',
      ...input,
    };

    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(mockUser);
    db.staff.create.mockResolvedValue({ id: 'staff-1', userId: 'user-2' });

    // Act
    const result = await createEmployee(input);

    // Assert
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: input.name,
        role: 'STAFF',
      }),
    });

    expect(db.staff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        position: input.position,
      }),
    });

    expect(db.teacher.create).not.toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  it('should throw error if email exists', async () => {
    // Arrange
    const input = {
      name: 'Duplicate User',
      email: 'duplicate@example.com',
      unitId: 'unit-1',
      role: 'STAFF' as const,
      gender: 'MALE' as const,
      position: 'Staff',
    };

    db.user.findUnique.mockResolvedValue({ id: 'existing' });

    // Act & Assert
    await expect(createEmployee(input)).rejects.toThrow('Email already exists');
  });

  it('gives an employee created without a password a random one, never a fixed default', async () => {
    const bcrypt = (await import('bcryptjs')).default as unknown as {
      hash: ReturnType<typeof vi.fn>;
    };
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: 'user-2' });
    db.staff.create.mockResolvedValue({ id: 'staff-2', userId: 'user-2' });
    db.teacher.create.mockResolvedValue({ id: 'teacher-2', userId: 'user-2' });

    await createEmployee({
      name: 'Siti Aminah',
      email: 'siti@example.com',
      unitId: 'unit-1',
      role: 'TEACHER' as const,
    } as never);

    const hashed = bcrypt.hash.mock.calls[0][0] as string;
    expect(hashed).not.toBe('password123');
    expect(hashed.length).toBeGreaterThanOrEqual(24);
  });
});
