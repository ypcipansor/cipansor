import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

import { app } from './app';
import { config } from '@/config';
import { assertProductionSecrets } from '@/config/assert-secrets';
import { assertSameSiteDeployment } from '@/config/same-site';
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

    // SameSite=Lax cookies only travel to a same-site API. A cross-site
    // CORS_ORIGIN is a topology this deployment does not support, so fail the
    // boot with that sentence rather than serve a login nobody can keep.
    assertSameSiteDeployment({ origins: config.cors.origins });

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

    // Initialize scheduled jobs
    if (config.env !== 'test') {
      initializeScheduler();
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
