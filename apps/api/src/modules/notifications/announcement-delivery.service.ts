import { NotificationStatus, NotificationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * An announcement in its audience's bells (decisions/siaran-pengumuman.md).
 * One row per recipient, linked by `announcement_id`; the push dispatcher picks
 * the rows up like any other (type ANNOUNCEMENT, so the recipient's
 * "Pengumuman" switch and quiet hours apply). Revising the announcement
 * rewrites its rows; withdrawing it removes them.
 */

/** The bell shows a preview; the board shows the whole text. */
export const ANNOUNCEMENT_EXCERPT_LENGTH = 500;

export const announcementExcerpt = (text: string) =>
  text.length <= ANNOUNCEMENT_EXCERPT_LENGTH
    ? text
    : `${text.slice(0, ANNOUNCEMENT_EXCERPT_LENGTH - 1).trimEnd()}…`;

/** Where a bell row opens: the board, with this announcement shown. */
export const announcementLink = (announcementId: string) => `/announcements?id=${announcementId}`;

const BATCH = 1000;

/** Writes one bell row per recipient; returns how many were written. */
export async function deliverAnnouncement(announcement: {
  id: string;
  title: string;
  content: string;
  sentBy: string;
  /** Later than now: the rows wait (bell and push) until then. */
  scheduledAt: Date | null;
  recipients: readonly string[];
}): Promise<number> {
  const recipients = [...new Set(announcement.recipients)];
  let written = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const { count } = await prisma.notification.createMany({
      data: recipients.slice(i, i + BATCH).map((userId) => ({
        userId,
        type: NotificationType.ANNOUNCEMENT,
        title: announcement.title,
        message: announcementExcerpt(announcement.content),
        link: announcementLink(announcement.id),
        scheduledAt: announcement.scheduledAt,
        announcementId: announcement.id,
        data: { sentBy: announcement.sentBy },
      })),
    });
    written += count;
  }
  return written;
}

/** New words for the rows already delivered. A push already sent stays as it was. */
export async function reviseAnnouncementDelivery(
  announcementId: string,
  change: { title?: string; content?: string }
): Promise<void> {
  if (change.title === undefined && change.content === undefined) return;
  await prisma.notification.updateMany({
    where: { announcementId },
    data: {
      ...(change.title !== undefined ? { title: change.title } : {}),
      ...(change.content !== undefined ? { message: announcementExcerpt(change.content) } : {}),
    },
  });
}

/** Takes the announcement out of every bell. */
export async function withdrawAnnouncementDelivery(announcementId: string): Promise<number> {
  const { count } = await prisma.notification.deleteMany({ where: { announcementId } });
  return count;
}

export interface AnnouncementDelivery {
  /** Bells it is in. */
  recipients: number;
  /** Of those, read. */
  read: number;
}

/** Per announcement: how many bells it is in, and how many of them were read. */
export async function announcementDeliveryCounts(
  announcementIds: string[]
): Promise<Map<string, AnnouncementDelivery>> {
  const counts = new Map(announcementIds.map((id) => [id, { recipients: 0, read: 0 }]));
  if (announcementIds.length === 0) return counts;
  const groups = await prisma.notification.groupBy({
    by: ['announcementId', 'status'],
    where: { announcementId: { in: announcementIds } },
    _count: { _all: true },
  });
  for (const group of groups) {
    const entry = group.announcementId ? counts.get(group.announcementId) : undefined;
    if (!entry) continue;
    entry.recipients += group._count._all;
    if (group.status === NotificationStatus.READ) entry.read += group._count._all;
  }
  return counts;
}
