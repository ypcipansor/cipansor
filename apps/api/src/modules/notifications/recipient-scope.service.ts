import { prisma } from '../../lib/prisma';
import { Errors } from '../../middleware/error';
import { seesAllUnits } from '@/utils/resolve-unit-id';

// Kept out of notifications.service.ts: that file is loaded by most modules
// (through the event bus), and resolve-unit-id reads RoleCode at load time,
// which the many tests that mock `@prisma/client` do not provide.

/** Who is sending a hand-written notification: the fields of the token that decide its reach. */
export interface NotificationSender {
  sub: string;
  roleCode?: string | null;
  role?: string | null;
  unitId?: string | null;
}

/**
 * Refuses a hand-written notification addressed to someone outside the
 * sender's reach. A notification is shown in the recipient's bell and, since
 * Web Push, on their lock screen; who may put text there follows the same
 * scope as who may read their unit's rows. Roles that see every unit (the
 * yayasan's organs, cross-unit services, Super Admin) reach everyone; anyone
 * else reaches people of their own unit — by the account's unit or by an
 * active role assignment in it (a wali whose children are in two units holds
 * one in each).
 *
 * Producers inside the API (permits, finance, the scheduler …) call
 * `createNotification` directly and are not affected: they address the people
 * their own rules already chose.
 */
export async function assertRecipientsInScope(
  sender: NotificationSender,
  userIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0 || seesAllUnits(sender)) return;
  if (!sender.unitId) throw Errors.forbidden('Akun ini tidak terikat pada unit mana pun');
  const reachable = await prisma.user.count({
    where: {
      id: { in: ids },
      OR: [
        { unitId: sender.unitId },
        { userRoles: { some: { unitId: sender.unitId, isActive: true } } },
      ],
    },
  });
  if (reachable !== ids.length) {
    throw Errors.forbidden('Penerima notifikasi harus berada di unit Anda');
  }
}
