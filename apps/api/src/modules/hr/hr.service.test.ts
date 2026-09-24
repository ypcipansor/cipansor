import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma', () => {
  const mockPrisma: Record<string, any> = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    teacher: { update: vi.fn() },
    staff: { update: vi.fn() },
  };
  mockPrisma.$transaction = vi.fn((cb: any) => cb(mockPrisma));
  return { prisma: mockPrisma };
});

vi.mock('../../utils/user-suspension', () => ({
  markUserSuspended: vi.fn(async () => undefined),
  invalidateUserSuspensionCache: vi.fn(async () => undefined),
}));

import { prisma } from '../../lib/prisma';
import { markUserSuspended, invalidateUserSuspensionCache } from '../../utils/user-suspension';
import { updateEmployee, deleteEmployee } from './hr.service';

const mock = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  mock.user.update.mockResolvedValue({ id: 'u1', accountStateVersion: 4 });
});

/**
 * Deactivating or soft-deleting an employee must invalidate the shared
 * suspension cache, otherwise the account's still-valid access token keeps
 * authenticating until the TTL lapses.
 */
describe('hr employee suspension-cache invalidation', () => {
  it('primes the suspension cache when an employee is deactivated', async () => {
    mock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'STAFF', staff: { id: 'st1' } });

    await updateEmployee('u1', { isActive: false });

    expect(markUserSuspended).toHaveBeenCalledWith('u1', 4);
  });

  it('drops the cached answer when an employee is reactivated', async () => {
    mock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'STAFF', staff: { id: 'st1' } });

    await updateEmployee('u1', { isActive: true });

    expect(invalidateUserSuspensionCache).toHaveBeenCalledWith('u1', 4);
    expect(markUserSuspended).not.toHaveBeenCalled();
  });

  it('leaves the cache alone on a profile-only edit', async () => {
    mock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'STAFF', staff: { id: 'st1' } });

    await updateEmployee('u1', { name: 'Nama Baru' });

    expect(markUserSuspended).not.toHaveBeenCalled();
    expect(invalidateUserSuspensionCache).not.toHaveBeenCalled();
  });

  it('marks a deleted employee suspended so the token stops working', async () => {
    mock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'STAFF', staff: { id: 'st1' } });
    mock.user.update.mockResolvedValue({
      id: 'u1',
      teacher: null,
      staff: { id: 'st1' },
      accountStateVersion: 9,
    });
    // The transaction body reads `user.teacher`/`user.staff` off the update result.
    mock.$transaction.mockImplementation((cb: any) => cb(mock));

    await deleteEmployee('u1');

    expect(markUserSuspended).toHaveBeenCalledWith('u1', 9);
  });
});
