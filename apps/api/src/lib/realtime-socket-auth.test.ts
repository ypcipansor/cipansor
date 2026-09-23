/**
 * Socket.IO authorization boundary — real server, real clients.
 *
 * Items 10–12 of the review: a suspended account kept its realtime session, any
 * authenticated client could join any `unit:<id>` / `role:<name>` room, and the
 * dashboard subscription honoured the caller's own `unitId`. Those are decisions
 * about *who may receive which broadcast*, and a room membership is the grant —
 * so the only meaningful test drives a live Socket.IO server over the wire with
 * a real signed cookie, not a mocked `socket` object.
 *
 * `realtime-scope.test.ts` pins the pure predicates; this suite pins the wiring
 * in `initializeSocketIO`: that the handshake reads account state, that the
 * event handlers consult the predicates, and that a refusal emits `FORBIDDEN`
 * instead of joining.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const userFindUnique = vi.fn();
const suspensionFindFirst = vi.fn();
const assignmentFindMany = vi.fn();
const attendanceFindMany = vi.fn().mockResolvedValue([]);
const paymentFindMany = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    boardMemberSuspension: { findFirst: (...args: unknown[]) => suspensionFindFirst(...args) },
    userRoleAssignment: { findMany: (...args: unknown[]) => assignmentFindMany(...args) },
    attendance: { findMany: (...args: unknown[]) => attendanceFindMany(...args) },
    payment: { findMany: (...args: unknown[]) => paymentFindMany(...args) },
    student: { count: vi.fn().mockResolvedValue(0) },
    teacher: { count: vi.fn().mockResolvedValue(0) },
    hafidzStudent: { count: vi.fn().mockResolvedValue(0) },
    murojaahRecord: { aggregate: vi.fn().mockResolvedValue({ _avg: { qualityScore: 0 } }) },
    unit: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// `initializeSocketIO` constructs two ioredis clients. Redis is not the
// subject here; a stub keeps the suite offline.
vi.mock('ioredis', () => ({
  default: class {
    subscribe() {}
    psubscribe() {}
    on() {}
    get() {
      return Promise.resolve(null);
    }
    setex() {
      return Promise.resolve('OK');
    }
    del() {
      return Promise.resolve(1);
    }
    publish() {
      return Promise.resolve(1);
    }
    quit() {
      return Promise.resolve('OK');
    }
  },
}));

import { initializeSocketIO, closeRealtimeConnections } from './realtime';
import { ACCESS_TOKEN_COOKIE } from '@cipansor/shared';

const SECRET = process.env.JWT_SECRET as string;

function accessToken(over: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: 'u-actor',
      email: 'actor@example.com',
      role: 'STAFF',
      roleCode: 'SDIT_ADMIN',
      unitId: 'unit-sdit',
      type: 'access',
      ...over,
    },
    SECRET,
    { expiresIn: '1h' }
  );
}

function openSocket(port: number, token: string): ClientSocket {
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    extraHeaders: { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` },
    reconnection: false,
  });
}

function connect(port: number, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = openSocket(port, token);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/**
 * Drive a connection to its terminal state, whatever that is.
 *
 * A refused handshake is not a transport error: the server accepts the
 * transport and then disconnects the namespace, so the client may see
 * `disconnect` (or, if the refusal beats the CONNECT ack, never see `connect`
 * at all). Waiting on `connect` alone hangs, so this settles on the first of
 * connect/disconnect/connect_error and then lets a fast server-side disconnect
 * land before the assertion reads `socket.connected`.
 */
async function connectionOutcome(
  port: number,
  token: string
): Promise<{ socket: ClientSocket; connected: boolean }> {
  const socket = openSocket(port, token);
  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.once('connect', settle);
    socket.once('disconnect', settle);
    socket.once('connect_error', settle);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { socket, connected: socket.connected };
}

function nextEvent<T = any>(socket: ClientSocket, name: string): Promise<T> {
  return new Promise((resolve) => socket.once(name, resolve));
}

describe('Socket.IO authorization boundary', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer();
    initializeSocketIO(server as never);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await closeRealtimeConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    userFindUnique.mockReset().mockResolvedValue({ isActive: true, deletedAt: null });
    suspensionFindFirst.mockReset().mockResolvedValue(null);
    assignmentFindMany.mockReset().mockResolvedValue([]);
    attendanceFindMany.mockReset().mockResolvedValue([]);
    paymentFindMany.mockReset().mockResolvedValue([]);
  });

  it('refuses the handshake for a suspended account', async () => {
    suspensionFindFirst.mockResolvedValue({ id: 'susp-1' });

    const { socket, connected } = await connectionOutcome(port, accessToken());
    expect(connected).toBe(false);
    socket.disconnect();
  });

  it('refuses the handshake for a deactivated account', async () => {
    userFindUnique.mockResolvedValue({ isActive: false, deletedAt: null });

    const { socket, connected } = await connectionOutcome(port, accessToken());
    expect(connected).toBe(false);
    socket.disconnect();
  });

  it('refuses the handshake for a deleted account', async () => {
    userFindUnique.mockResolvedValue({ isActive: true, deletedAt: new Date() });

    const { socket, connected } = await connectionOutcome(port, accessToken());
    expect(connected).toBe(false);
    socket.disconnect();
  });

  it('rejects an arbitrary unit room join and emits FORBIDDEN', async () => {
    const socket = await connect(port, accessToken());
    const forbidden = nextEvent<{ code: string }>(socket, 'error');

    socket.emit('join-unit', 'unit-smpit');

    expect((await forbidden).code).toBe('FORBIDDEN');
    socket.disconnect();
  });

  it('accepts a join for the actor own unit', async () => {
    const socket = await connect(port, accessToken());
    let refused = false;
    socket.on('error', () => {
      refused = true;
    });

    socket.emit('join-unit', 'unit-sdit');
    // Give the server a turn to answer if it were going to refuse.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(refused).toBe(false);
    socket.disconnect();
  });

  it('rejects a governance role room join from an ordinary unit admin', async () => {
    const socket = await connect(port, accessToken({ roleCode: 'SDIT_ADMIN' }));
    const forbidden = nextEvent<{ code: string }>(socket, 'error');

    socket.emit('join-role', 'YAYASAN_PENGAWAS');

    expect((await forbidden).code).toBe('FORBIDDEN');
    socket.disconnect();
  });

  it('rejects a global dashboard subscription for a unit-scoped actor', async () => {
    const socket = await connect(port, accessToken({ roleCode: 'SDIT_ADMIN' }));
    const forbidden = nextEvent<{ code: string }>(socket, 'error');

    socket.emit('subscribe:dashboard', {});

    expect((await forbidden).code).toBe('FORBIDDEN');
    socket.disconnect();
  });

  it('rejects a cross-unit dashboard subscription for a unit-scoped actor', async () => {
    const socket = await connect(port, accessToken({ roleCode: 'SDIT_ADMIN' }));
    const forbidden = nextEvent<{ code: string }>(socket, 'error');

    socket.emit('subscribe:dashboard', { unitId: 'unit-smpit' });

    expect((await forbidden).code).toBe('FORBIDDEN');
    socket.disconnect();
  });

  it('allows the global dashboard for a foundation-wide role', async () => {
    const socket = await connect(port, accessToken({ roleCode: 'YAYASAN_PENGAWAS', unitId: null }));
    let refused = false;
    socket.on('error', () => {
      refused = true;
    });

    socket.emit('subscribe:dashboard', {});
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(refused).toBe(false);
    socket.disconnect();
  });

  it('cuts an open socket when the account is suspended after connect', async () => {
    const socket = await connect(port, accessToken());

    // The suspension commits while the socket is already open; the next room
    // join must re-read state and refuse.
    suspensionFindFirst.mockResolvedValue({ id: 'susp-1' });

    const forbidden = nextEvent<{ code: string }>(socket, 'error');
    socket.emit('join-unit', 'unit-sdit');

    expect((await forbidden).code).toBe('UNAUTHORIZED');
    // The refusal also closes the socket, so the rooms it already held stop
    // delivering. The server-side `disconnect(true)` lands a moment later.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(socket.connected).toBe(false);
    socket.disconnect();
  });

  it('sends a unitless non-foundation actor no foundation-wide recent records', async () => {
    // Regression: `sendRecentEvents` scoped the initial payload to every unit
    // when an actor had no verified unit, so a unitless teacher/unit-admin was
    // handed other units' students and payment amounts on connect. The query
    // must not run at all for such an actor.
    assignmentFindMany.mockResolvedValue([]);
    const socket = await connect(port, accessToken({ roleCode: 'SDIT_ADMIN', unitId: null }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(attendanceFindMany).not.toHaveBeenCalled();
    expect(paymentFindMany).not.toHaveBeenCalled();
    socket.disconnect();
  });

  it('scopes a unit-bound actor recent records to its own unit', async () => {
    assignmentFindMany.mockResolvedValue([{ unitId: 'unit-sdit' }]);
    const socket = await connect(
      port,
      accessToken({ roleCode: 'SDIT_ADMIN', unitId: 'unit-sdit' })
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(attendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student: { unitId: { in: ['unit-sdit'] } } }),
      })
    );
    socket.disconnect();
  });
});
