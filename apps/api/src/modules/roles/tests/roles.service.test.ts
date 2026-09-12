import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userRoleAssignment: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/redis', () => ({ redis: {} }));

import { prisma } from '@/lib/prisma';
import { RolesService } from '../roles.service';

const mocked = prisma as unknown as {
  userRoleAssignment: Record<string, ReturnType<typeof vi.fn>>;
};

describe('RolesService.switchRole', () => {
  const service = new RolesService();
  beforeEach(() => vi.clearAllMocks());

  it('menolak assignment yang sudah kedaluwarsa', async () => {
    mocked.userRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
      expiresAt: new Date(Date.now() - 1000),
    } as any);

    await expect(service.switchRole('u-1', 'assign-1')).rejects.toThrow(
      /expired/i,
    );

    expect(mocked.userRoleAssignment.updateMany).not.toHaveBeenCalled();
    expect(mocked.userRoleAssignment.update).not.toHaveBeenCalled();
  });

  it('mengizinkan assignment yang masih berlaku', async () => {
    mocked.userRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
      expiresAt: new Date(Date.now() + 60_000),
      role: { code: 'SDIT_GURU' },
      user: { id: 'u-1' },
    } as any);
    mocked.userRoleAssignment.updateMany.mockResolvedValue({ count: 1 } as any);
    mocked.userRoleAssignment.update.mockResolvedValue({ id: 'assign-1' } as any);

    await expect(service.switchRole('u-1', 'assign-1')).resolves.toMatchObject({
      activeRole: { id: 'assign-1' },
    });

    expect(mocked.userRoleAssignment.updateMany).toHaveBeenCalled();
    expect(mocked.userRoleAssignment.update).toHaveBeenCalled();
  });
});
