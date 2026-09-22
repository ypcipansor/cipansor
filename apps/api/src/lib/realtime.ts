/**
 * Real-time Events Service
 * Provides Socket.IO integration for live dashboard updates
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { verifyToken, JwtPayload } from '@/lib/jwt';
import Redis from 'ioredis';
import type { DashboardMetrics, DashboardAlert } from '@cipansor/shared';
import { STUDENT_STATUS, parseCookieHeader, ACCESS_TOKEN_COOKIE } from '@cipansor/shared';

// Event types
export interface LiveEvent {
  type: 'attendance' | 'payment' | 'tahfidz' | 'notification';
  data: unknown;
  timestamp: string;
}

export interface AttendanceEvent {
  studentId: string;
  studentName: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  unitName: string;
  className: string;
  time: string;
}

export interface PaymentEvent {
  invoiceId: string;
  studentName: string;
  amount: number;
  type: string;
  unitName: string;
  time: string;
}

export interface TahfidzEvent {
  studentId: string;
  studentName: string;
  surah: string;
  ayahCount: number;
  unitName: string;
  time: string;
}

let io: SocketIOServer | null = null;
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

export type { DashboardMetrics, DashboardAlert };

/**
 * Initialize Socket.IO server
 */
export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      // Socket.IO delegates to the same `cors` package as the HTTP app, so the
      // comma-joined-header bug applied here too. Share the parsed allowlist.
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Initialize Redis for pub/sub
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redisPublisher = new Redis(redisUrl);
  redisSubscriber = new Redis(redisUrl);

  // Subscribe to dashboard metrics channels (including pattern for unit-specific)
  redisSubscriber.subscribe('dashboard:metrics', 'dashboard:alerts', (err) => {
    if (err) {
      logger.error('Failed to subscribe to Redis channels:', err);
    } else {
      logger.info('Subscribed to Redis dashboard channels');
    }
  });

  // Subscribe to pattern for unit-specific metrics
  redisSubscriber.psubscribe('dashboard:metrics:unit:*', (err) => {
    if (err) {
      logger.error('Failed to subscribe to unit metrics pattern:', err);
    } else {
      logger.info('Subscribed to unit-specific metrics pattern');
    }
  });

  // Handle Redis messages
  redisSubscriber.on('message', (channel, message) => {
    try {
      if (channel === 'dashboard:metrics') {
        const metrics = JSON.parse(message) as DashboardMetrics;
        io?.to('dashboard').emit('metrics:update', metrics);
        logger.debug('Broadcasted global metrics update');
      } else if (channel === 'dashboard:alerts') {
        const alert = JSON.parse(message) as DashboardAlert;
        io?.to('dashboard').emit('alert:new', alert);
        logger.info(`Broadcasted alert: ${alert.title}`);
      }
    } catch (error) {
      logger.error(`Error handling Redis message from ${channel}:`, error);
    }
  });

  // Handle pattern-matched messages (unit-specific metrics)
  redisSubscriber.on('pmessage', (pattern, channel, message) => {
    try {
      if (pattern === 'dashboard:metrics:unit:*') {
        // Extract unitId from channel name: dashboard:metrics:unit:xyz
        const unitId = channel.split(':').pop();
        const metrics = JSON.parse(message) as DashboardMetrics;

        // Broadcast to unit-specific dashboard room
        io?.to(`dashboard:unit:${unitId}`).emit('metrics:update', metrics);

        logger.debug('Broadcasted unit metrics update', { unitId });
      }
    } catch (error) {
      logger.error(`Error handling Redis pmessage from ${channel}:`, error);
    }
  });

  /**
   * Authenticate WebSocket connection
   * Verifies JWT token and returns user payload
   */
  async function authenticateSocket(socket: Socket): Promise<JwtPayload | null> {
    // The browser sends no token in the handshake any more — the session cookie
    // is `HttpOnly`, so script cannot read it to copy into `auth.token`. Read it
    // from the handshake's cookie header instead; the explicit token remains
    // supported for the native client.
    const cookieHeader = socket.handshake.headers?.cookie ?? '';
    const cookieToken = parseCookieHeader(cookieHeader)[ACCESS_TOKEN_COOKIE];
    const token = socket.handshake.auth?.token || cookieToken;

    if (!token) {
      logger.warn('Socket connection without auth token', { socketId: socket.id });
      return null;
    }

    try {
      const payload = verifyToken(token);

      if (payload.type !== 'access') {
        logger.warn('Invalid token type for WebSocket', {
          socketId: socket.id,
          tokenType: payload.type,
        });
        return null;
      }

      logger.debug('Socket authenticated successfully', {
        socketId: socket.id,
        userId: payload.sub,
        role: payload.role,
      });

      return payload;
    } catch (error) {
      logger.warn('Socket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  io.on('connection', async (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Authenticate the connection
    const user = await authenticateSocket(socket);

    if (!user) {
      socket.emit('error', {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid access token.',
      });
      socket.disconnect(true);
      logger.info(`Disconnected unauthenticated socket: ${socket.id}`);
      return;
    }

    // Attach user context to socket
    socket.data.user = {
      id: user.sub,
      email: user.email,
      role: user.role,
      unitId: user.unitId,
      roleId: user.roleId,
    };

    logger.info(`Authenticated client connected`, {
      socketId: socket.id,
      userId: user.sub,
      role: user.role,
      unitId: user.unitId,
    });

    // Auto-join user-specific room
    socket.join(`user:${user.sub}`);

    // Auto-join unit-specific room if user has a unit
    if (user.unitId) {
      socket.join(`unit:${user.unitId}`);
      logger.debug(`Socket auto-joined unit room`, {
        socketId: socket.id,
        unitId: user.unitId,
      });
    }

    // Auto-join role-specific room
    socket.join(`role:${user.role}`);
    logger.debug(`Socket auto-joined role room`, {
      socketId: socket.id,
      role: user.role,
    });

    // Join unit-specific rooms (additional units)
    socket.on('join-unit', (unitId: string) => {
      // Verify user has permission to access this unit
      // For now, allow all authenticated users
      socket.join(`unit:${unitId}`);
      logger.info(`Socket ${socket.id} joined unit:${unitId}`);
    });

    // Join role-specific rooms (additional roles)
    socket.on('join-role', (role: string) => {
      socket.join(`role:${role}`);
      logger.info(`Socket ${socket.id} joined role:${role}`);
    });

    // Subscribe to dashboard updates
    socket.on('subscribe:dashboard', async (options?: { unitId?: string }) => {
      socket.join('dashboard');
      logger.info(`Socket ${socket.id} subscribed to dashboard updates`, {
        unitId: options?.unitId || 'all',
      });

      // Send current metrics immediately (filtered by unit if provided)
      try {
        const metrics = await getCurrentDashboardMetrics(options?.unitId);
        socket.emit('metrics:update', metrics);
      } catch (error) {
        logger.error('Error sending initial metrics:', error);
      }
    });

    // Subscribe to unit-specific dashboard updates
    socket.on('subscribe:unit-dashboard', async (unitId: string) => {
      if (!unitId) {
        socket.emit('error', {
          code: 'INVALID_UNIT_ID',
          message: 'Unit ID is required',
        });
        return;
      }

      // Verify user has access to this unit
      // For now, allow if user is in the same unit or has admin role
      const hasAccess =
        socket.data.user?.unitId === unitId || socket.data.user?.role === 'SUPER_ADMIN';

      if (!hasAccess) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'You do not have access to this unit',
        });
        return;
      }

      socket.join(`dashboard:unit:${unitId}`);
      logger.info(`Socket ${socket.id} subscribed to unit dashboard`, { unitId });

      // Send unit-specific metrics immediately
      try {
        const metrics = await getCurrentDashboardMetrics(unitId);
        socket.emit('metrics:update', metrics);
      } catch (error) {
        logger.error('Error sending unit metrics:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });

    // Send initial data on connect
    sendRecentEvents(socket);
  });

  logger.info('Socket.IO initialized');
  return io;
}

/**
 * Get Socket.IO instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Broadcast attendance event
 */
export function broadcastAttendance(event: AttendanceEvent): void {
  if (!io) return;

  const liveEvent: LiveEvent = {
    type: 'attendance',
    data: event,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all clients
  io.emit('live-event', liveEvent);

  // Also emit specific attendance event
  io.emit('attendance-update', event);
}

/**
 * Broadcast payment event
 */
export function broadcastPayment(event: PaymentEvent): void {
  if (!io) return;

  const liveEvent: LiveEvent = {
    type: 'payment',
    data: event,
    timestamp: new Date().toISOString(),
  };

  io.emit('live-event', liveEvent);
  io.emit('payment-update', event);
}

/**
 * Broadcast tahfidz event
 */
export function broadcastTahfidz(event: TahfidzEvent): void {
  if (!io) return;

  const liveEvent: LiveEvent = {
    type: 'tahfidz',
    data: event,
    timestamp: new Date().toISOString(),
  };

  io.emit('live-event', liveEvent);
  io.emit('tahfidz-update', event);
}

/**
 * Send recent events to newly connected socket
 */
async function sendRecentEvents(socket: Socket): Promise<void> {
  try {
    // Get recent attendance (last 10)
    const recentAttendance = await prisma.attendance.findMany({
      take: 10,
      orderBy: { date: 'desc' },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            unit: { select: { name: true } },
          },
        },
      },
    });

    const attendanceEvents: AttendanceEvent[] = recentAttendance.map((a) => ({
      studentId: a.studentId,
      studentName: a.student.user?.name || 'Unknown',
      status: a.status as AttendanceEvent['status'],
      unitName: a.student.unit?.name || '',
      className: '',
      time: a.date.toISOString(),
    }));

    socket.emit('initial-attendance', attendanceEvents);

    // Get recent payments (last 10)
    const recentPayments = await prisma.payment.findMany({
      take: 10,
      orderBy: { paidAt: 'desc' },
      include: {
        invoice: {
          include: {
            student: {
              include: {
                user: { select: { name: true } },
                unit: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const paymentEvents: PaymentEvent[] = recentPayments.map((p) => ({
      invoiceId: p.invoiceId,
      studentName: p.invoice.student?.user?.name || 'Unknown',
      amount: Number(p.amount),
      type: 'payment',
      unitName: p.invoice.student?.unit?.name || '',
      time: p.paidAt?.toISOString() || '',
    }));

    socket.emit('initial-payments', paymentEvents);
  } catch (error) {
    logger.error('Error sending recent events:', error);
  }
}

/**
 * Get live dashboard summary
 */
export async function getLiveDashboardSummary(): Promise<{
  todayAttendance: { present: number; absent: number; late: number };
  todayRevenue: number;
  recentActivity: LiveEvent[];
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Today's attendance
  const attendanceCounts = await prisma.attendance.groupBy({
    by: ['status'],
    where: { date: { gte: today } },
    _count: true,
  });

  const todayAttendance = {
    present: attendanceCounts.find((a) => a.status === 'PRESENT')?._count || 0,
    absent: attendanceCounts.find((a) => a.status === 'ABSENT')?._count || 0,
    late: attendanceCounts.find((a) => a.status === 'LATE')?._count || 0,
  };

  // Today's revenue
  const todayPayments = await prisma.payment.aggregate({
    where: { paidAt: { gte: today } },
    _sum: { amount: true },
  });

  return {
    todayAttendance,
    todayRevenue: Number(todayPayments._sum.amount || 0),
    recentActivity: [],
  };
}

/**
 * Get current dashboard metrics
 * @param unitId Optional unit ID to filter metrics by specific unit
 */
export async function getCurrentDashboardMetrics(unitId?: string): Promise<DashboardMetrics> {
  try {
    // Build cache key
    const cacheKey = unitId ? `metrics:unit:${unitId}` : 'metrics:global';
    const CACHE_TTL = 60; // 60 seconds TTL

    // Try to get from cache first
    if (redisPublisher) {
      try {
        const cached = await redisPublisher.get(cacheKey);
        if (cached) {
          logger.debug('Dashboard metrics cache hit', { cacheKey, unitId: unitId || 'global' });
          return JSON.parse(cached);
        }
        logger.debug('Dashboard metrics cache miss', { cacheKey, unitId: unitId || 'global' });
      } catch (cacheError) {
        logger.warn('Redis cache read error, falling back to database', { error: cacheError });
      }
    }

    // Build where clause for unit filtering
    const unitFilter = unitId ? { unitId } : {};

    // Get total students (filtered by unit if provided)
    const totalStudents = await prisma.student.count({
      where: unitFilter,
    });
    const activeStudents = await prisma.student.count({
      where: {
        ...unitFilter,
        status: STUDENT_STATUS.ACTIVE,
      },
    });

    // Get total teachers (filtered by unit if provided)
    const totalTeachers = await prisma.teacher.count({
      where: unitFilter,
    });

    // Get today's attendance (filtered by unit if provided)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAttendance = await prisma.attendance.count({
      where: {
        date: { gte: today },
        status: 'PRESENT',
        ...(unitId
          ? {
              student: { unitId },
            }
          : {}),
      },
    });

    const attendanceRate =
      activeStudents > 0 ? Math.round((todayAttendance / activeStudents) * 100) : 0;

    // Get total hafidz count from tracking table
    // This is accurate as it counts students who completed 30 Juz
    const totalHafidz = await prisma.hafidzStudent.count({
      where: {
        ...(unitId
          ? {
              student: { unitId },
            }
          : {}),
      },
    });

    const avgQuality = await prisma.murojaahRecord.aggregate({
      _avg: { qualityScore: true },
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        ...(unitId
          ? {
              student: { unitId },
            }
          : {}),
      },
    });

    const metrics = {
      students: {
        total: totalStudents,
        active: activeStudents,
        change: 0, // Calculate from previous period if needed
      },
      teachers: {
        total: totalTeachers,
      },
      attendance: {
        rate: attendanceRate,
        present: todayAttendance,
        total: activeStudents,
      },
      tahfidz: {
        totalHafidz: totalHafidz,
        avgQuality: Number(avgQuality._avg.qualityScore || 0),
      },
      timestamp: new Date().toISOString(),
    };

    logger.debug('Dashboard metrics calculated', {
      unitId: unitId || 'all',
      totalStudents,
      activeStudents,
      attendanceRate,
    });

    // Cache the result in Redis
    if (redisPublisher) {
      try {
        await redisPublisher.setex(cacheKey, CACHE_TTL, JSON.stringify(metrics));
        logger.debug('Dashboard metrics cached', { cacheKey, ttl: CACHE_TTL });
      } catch (cacheError) {
        logger.warn('Redis cache write error', { error: cacheError });
        // Continue without caching - not a critical error
      }
    }

    return metrics;
  } catch (error) {
    logger.error('Error getting dashboard metrics:', error);
    throw error;
  }
}

/**
 * Publish dashboard metrics to Redis
 * @param metrics Dashboard metrics to publish
 * @param unitId Optional unit ID for unit-specific metrics
 */
export async function publishDashboardMetrics(
  metrics: DashboardMetrics,
  unitId?: string
): Promise<void> {
  if (!redisPublisher) {
    logger.warn('Redis publisher not initialized');
    return;
  }

  try {
    // Invalidate cache when publishing new metrics
    const cacheKey = unitId ? `metrics:unit:${unitId}` : 'metrics:global';
    await redisPublisher.del(cacheKey);
    logger.debug('Invalidated metrics cache', { cacheKey });

    // Publish to global channel
    const channel = unitId ? `dashboard:metrics:unit:${unitId}` : 'dashboard:metrics';
    await redisPublisher.publish(channel, JSON.stringify(metrics));

    logger.debug('Published dashboard metrics to Redis', {
      channel,
      unitId: unitId || 'all',
    });
  } catch (error) {
    logger.error('Error publishing dashboard metrics:', error);
  }
}

/**
 * Publish dashboard alert to Redis
 */
export async function publishDashboardAlert(alert: DashboardAlert): Promise<void> {
  if (!redisPublisher) {
    logger.warn('Redis publisher not initialized');
    return;
  }

  try {
    await redisPublisher.publish('dashboard:alerts', JSON.stringify(alert));
    logger.info(`Published alert: ${alert.title}`);
  } catch (error) {
    logger.error('Error publishing dashboard alert:', error);
  }
}

/**
 * Invalidate dashboard metrics cache
 * Useful when data changes outside of the normal flow
 * @param unitId Optional unit ID to invalidate specific unit cache
 */
export async function invalidateDashboardCache(unitId?: string): Promise<void> {
  if (!redisPublisher) {
    logger.warn('Redis publisher not initialized');
    return;
  }

  try {
    if (unitId) {
      // Invalidate specific unit cache
      const cacheKey = `metrics:unit:${unitId}`;
      await redisPublisher.del(cacheKey);
      logger.info('Invalidated unit metrics cache', { unitId });
    } else {
      // Invalidate global cache
      await redisPublisher.del('metrics:global');
      logger.info('Invalidated global metrics cache');
    }
  } catch (error) {
    logger.error('Error invalidating cache:', error);
  }
}

/**
 * Warm up dashboard metrics cache
 * Pre-calculates and caches metrics for all active units
 */
export async function warmDashboardCache(): Promise<void> {
  try {
    logger.info('Warming dashboard metrics cache...');

    // Warm global metrics
    await getCurrentDashboardMetrics();

    // Warm unit-specific metrics for all active units
    const activeUnits = await prisma.unit.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    // Run in parallel for faster warming
    // Note: If activeUnits count grows very large, consider using a concurrency limit (e.g., p-limit)
    const results = await Promise.allSettled(
      activeUnits.map((unit) => getCurrentDashboardMetrics(unit.id))
    );

    // Check for failures
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn(`Dashboard cache warming completed with ${failures.length} errors`, {
        errors: failures.map((f) => (f.status === 'rejected' ? f.reason : null)),
      });
    }

    logger.info(
      `Dashboard cache warmed for ${activeUnits.length + 1} metrics sets (global + ${activeUnits.length} units)`
    );
  } catch (error) {
    logger.error('Error warming dashboard cache:', error);
  }
}

/**
 * Cleanup connections
 */
export async function closeRealtimeConnections(): Promise<void> {
  if (redisPublisher) {
    await redisPublisher.quit();
    logger.info('Redis publisher disconnected');
  }
  if (redisSubscriber) {
    await redisSubscriber.quit();
    logger.info('Redis subscriber disconnected');
  }
  if (io) {
    io.close();
    logger.info('Socket.IO server closed');
  }
}
