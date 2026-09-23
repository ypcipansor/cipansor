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
import {
  SocketIdentity,
  allowedUnitIds,
  canJoinUnitRoom,
  canJoinRoleRoom,
  canSubscribeGlobalDashboard,
  isFoundationWideRole,
  resolveDashboardUnit,
} from '@/lib/realtime-scope';

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

      // A JWT is a point-in-time snapshot. It stays valid for its whole TTL
      // even after the account is suspended, deactivated or deleted, so a
      // signature check alone is not authentication — it only proves the token
      // *was* issued. This is the same persistent-state gate the REST
      // `authenticate` applies, applied at the socket handshake: a suspended
      // officer's still-unexpired access token must not open a realtime
      // session. Fails closed on a missing user.
      const [account, activeSuspension] = await Promise.all([
        prisma.user.findUnique({
          where: { id: payload.sub },
          select: { isActive: true, deletedAt: true },
        }),
        prisma.boardMemberSuspension.findFirst({
          where: { userId: payload.sub, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);

      if (!account || !account.isActive || account.deletedAt || activeSuspension) {
        logger.warn('Socket authentication refused for unusable account', {
          socketId: socket.id,
          userId: payload.sub,
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

  /**
   * Every unit the account is effectively assigned to.
   *
   * The token carries only the *active* role's unit, but a user can hold roles
   * in several units at once. A room grant that honoured only the token unit
   * would silently under-serve them; one that honoured the token unit *and* the
   * client's word would over-serve everyone. So the set is read from the live
   * assignments, under the same active/unexpired predicate the rest of the
   * auth code uses.
   */
  async function effectiveUnitIdsOf(userId: string): Promise<string[]> {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        unitId: { not: null },
      },
      select: { unitId: true },
    });
    return [...new Set(assignments.map((a) => a.unitId as string))];
  }

  /**
   * Re-check an account's persistent state for an already-open socket.
   *
   * A socket outlives the request that opened it. A suspension that commits
   * after the handshake does not expire the JWT already in the socket's
   * handshake data, so without this the suspended user keeps receiving every
   * broadcast their rooms carry. Called before any room join or subscription,
   * so a room grant is always made against current state rather than the state
   * at connect time.
   */
  async function isSocketAccountUsable(userId: string): Promise<boolean> {
    const [account, activeSuspension] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true, deletedAt: true },
      }),
      prisma.boardMemberSuspension.findFirst({
        where: { userId, status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    return !!account && account.isActive && !account.deletedAt && !activeSuspension;
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

    // The identity every room grant below is decided against. The effective
    // units are read from live assignments, not from the token alone, so a
    // user holding roles in several units can reach all of them.
    const identity: SocketIdentity = {
      userId: user.sub,
      roleCode: user.roleCode,
      unitId: user.unitId,
      effectiveUnitIds: await effectiveUnitIdsOf(user.sub),
    };

    // Attach user context to socket
    socket.data.user = {
      id: user.sub,
      email: user.email,
      role: user.role,
      roleCode: user.roleCode,
      unitId: user.unitId,
      roleId: user.roleId,
      identity,
    };

    logger.info(`Authenticated client connected`, {
      socketId: socket.id,
      userId: user.sub,
      role: user.role,
      unitId: user.unitId,
    });

    /**
     * Refuse a socket action whose account is no longer usable, closing the
     * socket. Returns true when the caller should stop.
     *
     * The check is live, not the handshake-time snapshot, so a suspension that
     * commits after the connection is still caught before it can widen the
     * socket's reach. Closing the socket (rather than only declining the event)
     * also stops the already-joined rooms from delivering anything further.
     */
    const refuseIfUnusable = async (): Promise<boolean> => {
      if (await isSocketAccountUsable(user.sub)) return false;
      logger.warn('Disconnecting socket whose account is no longer usable', {
        socketId: socket.id,
        userId: user.sub,
      });
      socket.emit('error', {
        code: 'UNAUTHORIZED',
        message: 'Akun Anda sudah tidak aktif. Sesi realtime dihentikan.',
      });
      socket.disconnect(true);
      return true;
    };

    // Auto-join user-specific room. This is the user's own room — a private
    // channel addressed by their own id — so no cross-user grant is possible.
    socket.join(`user:${user.sub}`);

    // Auto-join the unit rooms the account is actually assigned to.
    for (const unitId of allowedUnitIds(identity)) {
      socket.join(`unit:${unitId}`);
      logger.debug(`Socket auto-joined unit room`, { socketId: socket.id, unitId });
    }

    // Auto-join the active role's room only.
    if (user.roleCode) {
      socket.join(`role:${user.roleCode}`);
      logger.debug(`Socket auto-joined role room`, {
        socketId: socket.id,
        role: user.roleCode,
      });
    }

    // Join an additional unit room — only one the caller may actually reach.
    //
    // The old handler joined whatever string the client sent, so any
    // authenticated user could read any unit's traffic by naming its room. The
    // room *is* the authorization boundary here, so the join is decided from
    // the verified identity, never the client's argument.
    socket.on('join-unit', async (unitId: string) => {
      if (await refuseIfUnusable()) return;
      if (!canJoinUnitRoom(identity, unitId)) {
        logger.warn('Refused cross-unit socket room join', {
          socketId: socket.id,
          userId: user.sub,
          requestedUnitId: unitId,
        });
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'Anda tidak memiliki akses ke unit tersebut',
        });
        return;
      }
      socket.join(`unit:${unitId}`);
      logger.info(`Socket ${socket.id} joined unit:${unitId}`);
    });

    // Join an additional role room — only the caller's own active role.
    socket.on('join-role', async (role: string) => {
      if (await refuseIfUnusable()) return;
      if (!canJoinRoleRoom(identity, role)) {
        logger.warn('Refused cross-role socket room join', {
          socketId: socket.id,
          userId: user.sub,
          requestedRole: role,
        });
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'Anda tidak dapat bergabung ke peran lain',
        });
        return;
      }
      socket.join(`role:${role}`);
      logger.info(`Socket ${socket.id} joined role:${role}`);
    });

    // Subscribe to dashboard updates.
    //
    // The `dashboard` room is the *global* feed, and its metrics aggregate every
    // unit. A unit-scoped caller must not receive them, so the room is joined
    // only for foundation-wide roles — and when a unit is named, only one the
    // caller is entitled to, resolved from the verified identity rather than
    // from the caller's argument. The client-supplied `unitId` used to be
    // passed straight to the metrics query, so any signed-in user could read
    // any unit's figures.
    socket.on('subscribe:dashboard', async (options?: { unitId?: string }) => {
      if (await refuseIfUnusable()) return;

      const requestedUnit =
        options?.unitId && options.unitId !== 'all' ? options.unitId : undefined;

      if (!requestedUnit) {
        if (!canSubscribeGlobalDashboard(identity)) {
          logger.warn('Refused global dashboard subscription for unit-scoped socket', {
            socketId: socket.id,
            userId: user.sub,
            roleCode: user.roleCode,
          });
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'Dashboard global hanya untuk peran tingkat yayasan',
          });
          return;
        }
        socket.join('dashboard');
        logger.info(`Socket ${socket.id} subscribed to global dashboard`);
        try {
          socket.emit('metrics:update', await getCurrentDashboardMetrics());
        } catch (error) {
          logger.error('Error sending initial metrics:', error);
        }
        return;
      }

      const scoped = resolveDashboardUnit(identity, requestedUnit);
      if (!scoped) {
        logger.warn('Refused cross-unit dashboard subscription', {
          socketId: socket.id,
          userId: user.sub,
          requestedUnitId: requestedUnit,
        });
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'Anda tidak memiliki akses ke unit tersebut',
        });
        return;
      }

      socket.join(`dashboard:unit:${scoped}`);
      logger.info(`Socket ${socket.id} subscribed to dashboard updates`, { unitId: scoped });
      try {
        socket.emit('metrics:update', await getCurrentDashboardMetrics(scoped));
      } catch (error) {
        logger.error('Error sending initial metrics:', error);
      }
    });

    // Subscribe to unit-specific dashboard updates
    socket.on('subscribe:unit-dashboard', async (unitId: string) => {
      if (await refuseIfUnusable()) return;

      if (!unitId) {
        socket.emit('error', {
          code: 'INVALID_UNIT_ID',
          message: 'Unit ID is required',
        });
        return;
      }

      // A unit-scoped caller is pinned to a unit it belongs to; only a
      // foundation-wide role may name any unit. A unitless non-foundation
      // actor is refused rather than defaulted to the whole foundation.
      const scoped = resolveDashboardUnit(identity, unitId);

      if (!scoped) {
        logger.warn('Refused cross-unit dashboard subscription', {
          socketId: socket.id,
          userId: user.sub,
          requestedUnitId: unitId,
        });
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'You do not have access to this unit',
        });
        return;
      }
      unitId = scoped;

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

    // Send initial data on connect, scoped to what this socket may see.
    sendRecentEvents(socket, identity);
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
 * Disconnect every open socket belonging to a user.
 *
 * Called after a suspension commits. Authentication happens at the handshake,
 * so a socket opened before the suspension keeps its JWT and its room
 * memberships: the account-state gate on `join-*`/`subscribe:*` stops it
 * *widening* its reach, but the rooms it already holds would keep delivering
 * broadcasts. Disconnecting closes that window. Best-effort — if the realtime
 * server is not running there is nothing to disconnect, and the next event the
 * socket tries will fail the account check anyway.
 */
export function disconnectUserSockets(userId: string): void {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
  logger.info('Disconnected sockets for user', { userId });
}

/**
 * Emit an event to its unit room and to the foundation-wide dashboard.
 *
 * These broadcasts carry student names and payment amounts, so a global
 * `io.emit` delivered one unit's records to every signed-in user in every
 * other unit. The room is the authorization boundary: the event's own unit
 * room reaches the staff who may see it, and the `dashboard` room reaches the
 * foundation-wide roles that already see every unit on the executive
 * dashboard. `unitName` is what the events carry, so the unit id is resolved
 * from the room-name form used elsewhere (`unit:<id>`) — callers pass the id.
 */
function emitUnitScoped(eventName: string, event: { unitId?: string }, payload: unknown): void {
  if (!io) return;
  if (event.unitId) io.to(`unit:${event.unitId}`).emit(eventName, payload);
  io.to('dashboard').emit(eventName, payload);
}

/**
 * Broadcast attendance event
 */
export function broadcastAttendance(event: AttendanceEvent & { unitId?: string }): void {
  if (!io) return;

  const liveEvent: LiveEvent = {
    type: 'attendance',
    data: event,
    timestamp: new Date().toISOString(),
  };

  emitUnitScoped('live-event', event, liveEvent);
  emitUnitScoped('attendance-update', event, event);
}

/**
 * Broadcast payment event
 */
export function broadcastPayment(event: PaymentEvent & { unitId?: string }): void {
  if (!io) return;

  const liveEvent: LiveEvent = {
    type: 'payment',
    data: event,
    timestamp: new Date().toISOString(),
  };

  emitUnitScoped('live-event', event, liveEvent);
  emitUnitScoped('payment-update', event, event);
}

/**
 * Broadcast tahfidz event
 */
export function broadcastTahfidz(event: TahfidzEvent & { unitId?: string }): void {
  if (!io) return;

  const liveEvent: LiveEvent = {
    type: 'tahfidz',
    data: event,
    timestamp: new Date().toISOString(),
  };

  emitUnitScoped('live-event', event, liveEvent);
  emitUnitScoped('tahfidz-update', event, event);
}

/**
 * Send recent events to newly connected socket, scoped to its units.
 *
 * This used to read the ten most recent attendance and payment rows across the
 * whole foundation and hand them to every socket — a unit-scoped teacher
 * received other units' students by name and other units' payment amounts the
 * moment they connected. The scope is now the socket's verified units; a
 * foundation-wide role (whose REST view is already every unit) sees them all.
 */
async function sendRecentEvents(socket: Socket, identity: SocketIdentity): Promise<void> {
  try {
    const units = allowedUnitIds(identity);
    const foundationWide = isFoundationWideRole(identity.roleCode);

    // Fail closed for a non-foundation actor with no verified unit. The empty
    // scope below (`{}`) means "every unit" — the whole-foundation query — so a
    // unitless teacher/admin would otherwise be handed other units' students and
    // payment amounts the moment they connect. A foundation-wide role is the
    // only identity whose REST view is already every unit.
    if (!foundationWide && units.size === 0) return;

    const unitScope = foundationWide ? {} : { unitId: { in: [...units] } };

    // Get recent attendance (last 10)
    const recentAttendance = await prisma.attendance.findMany({
      take: 10,
      orderBy: { date: 'desc' },
      where: { student: unitScope },
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

    // Get recent payments (last 10), same unit scope.
    const recentPayments = await prisma.payment.findMany({
      take: 10,
      orderBy: { paidAt: 'desc' },
      where: { invoice: { student: unitScope } },
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
