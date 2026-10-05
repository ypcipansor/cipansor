import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import { dispatchPendingPush, webPushKeys } from '@/modules/notifications';

/**
 * Deliver pending notifications as Web Push, every fifteen seconds.
 *
 * Started on its own, not by `initializeScheduler`, and deliberately not behind
 * `SCHEDULER_ENABLED`. That switch keeps a staging copy from billing and
 * reminding as if it were live; this job creates nothing, it relays what the
 * environment's own users were already notified of, to devices they registered
 * on that environment. What keeps one environment from reaching another's
 * devices is the key pair: a subscription only accepts pushes signed with the
 * key it was made with (see `config.webPush`). With no key pair it never starts.
 *
 * Fifteen seconds is the delay a wali sees between "Izin disetujui" being
 * written and their phone buzzing — inside the polling decision's own budget
 * (decisions/realtime-polling.md) and one indexed query per tick when idle.
 */
let task: ScheduledTask | null = null;
let running = false;

/** One run, never two at once in this process. Exported for the tests. */
export async function runWebPushDispatch(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const summary = await dispatchPendingPush();
    if (summary.claimed > 0 || summary.pruned > 0) {
      logger.info('[WebPush] Dispatch run', summary);
    }
  } catch (error) {
    logger.error('[WebPush] Dispatch run failed', { error: String(error) });
  } finally {
    running = false;
  }
}

export function startWebPushDispatcher(): boolean {
  if (task) return true;
  if (!webPushKeys()) {
    logger.info('[WebPush] No VAPID key pair configured; push dispatch not started');
    return false;
  }
  task = cron.schedule('*/15 * * * * *', runWebPushDispatch, { timezone: 'Asia/Jakarta' });
  logger.info('[WebPush] Dispatcher started (every 15 seconds)');
  return true;
}

export function stopWebPushDispatcher(): void {
  task?.stop();
  task = null;
}
