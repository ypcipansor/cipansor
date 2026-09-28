/**
 * Dashboard Metrics History Job
 * Runs every minute and records the current metrics — yayasan-wide and per
 * unit — in `dashboard_history`, which the dashboard's trend reads.
 *
 * Alerts are not computed here: the dashboard derives its own from the data on
 * each read (`DashboardService.getActiveAlerts`).
 */

import { logger } from '@/lib/logger';
import { getCurrentDashboardMetrics } from '@/lib/dashboard-metrics';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Record global and per-unit dashboard metrics in the history table.
 */
export async function aggregateDashboardMetrics(): Promise<void> {
  try {
    logger.info('Starting dashboard metrics aggregation...');

    // Fresh figures: a history point must not repeat the cached previous one.
    const globalMetrics = await getCurrentDashboardMetrics(undefined, { fresh: true });

    // Save global history
    try {
      await prisma.dashboardHistory.create({
        data: {
          metrics: globalMetrics as unknown as Prisma.InputJsonValue,
          unitId: null,
        },
      });
    } catch (histError) {
      logger.error('Error saving global metrics history:', histError);
    }

    // Get all active units
    const units = await prisma.unit.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    // Calculate and record metrics for each unit
    await Promise.allSettled(
      units.map(async (unit) => {
        try {
          const unitMetrics = await getCurrentDashboardMetrics(unit.id, { fresh: true });

          // Save unit history
          await prisma.dashboardHistory.create({
            data: {
              metrics: unitMetrics as unknown as Prisma.InputJsonValue,
              unitId: unit.id,
            },
          });

          logger.debug('Unit metrics recorded', {
            unitId: unit.id,
            unitName: unit.name,
          });
        } catch (error) {
          logger.error('Error calculating unit metrics', {
            unitId: unit.id,
            error,
          });
        }
      })
    );

    logger.info('Dashboard metrics recorded', {
      globalMetrics: true,
      unitCount: units.length,
    });
  } catch (error) {
    logger.error('Error aggregating dashboard metrics:', error);
  }
}
