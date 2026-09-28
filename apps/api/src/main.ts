import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Continuous profiling (v11): v10's `profilesSampleRate` sampled per
  // transaction and was removed. Sample every session, and start/stop the
  // profiler with the active trace so the old "profile every transaction"
  // behaviour is preserved.
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
  // v11 collects request/response bodies, cookies, headers, query parameters,
  // database query data and user info by default; v10 collected none of it.
  // Keep the restrictive v10 baseline: this API serves santri records, and the
  // DSN may point at a Sentry project shared with other apps.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
  },
});

import { app } from './app';
import { config } from '@/config';
import { assertProductionSecrets } from '@/config/assert-secrets';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { initializeScheduler, stopScheduler } from '@/jobs';
import { initializeSocketIO, closeRealtimeConnections } from '@/lib/realtime';
import { initializeEventBus } from '@/lib/event-bus';
import { createServer } from 'http';

const PORT = config.port;

async function bootstrap() {
  try {
    // Before anything else, and before the port opens. Serving traffic signed
    // by a key published in .env.example is worse than not serving at all.
    assertProductionSecrets();

    // Test database connection
    logger.info('Connecting to database...');
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.IO
    initializeSocketIO(httpServer);
    logger.info('Real-time server initialized');

    // Initialize cross-module event bus
    initializeEventBus();
    logger.info('Event bus initialized');

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Cipansor API running on port ${PORT}`);
      logger.info(`📚 Environment: ${config.env}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}/api`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
    });

    // Initialize scheduled jobs — unless this copy is a staging environment that
    // switched them off (SCHEDULER_ENABLED=false; see config.scheduler).
    if (config.env !== 'test') {
      if (config.scheduler.enabled) {
        initializeScheduler();
      } else {
        logger.warn(
          '⏸️  Scheduler disabled (SCHEDULER_ENABLED=false): no cron jobs run in this process'
        );
      }
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);

      // Stop scheduled jobs
      stopScheduler();

      // Close real-time connections
      await closeRealtimeConnections();

      httpServer.close(async () => {
        logger.info('HTTP server closed');

        await prisma.$disconnect();
        logger.info('Database connection closed');

        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled errors
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', { promise, reason });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
