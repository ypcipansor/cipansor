import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PublicDonationType } from '@prisma/client';
import { OFFERED_DONATION_TYPES } from '@cipansor/shared';

// A new donation is given only as a type the yayasan offers: the public Wakaf &
// Infaq form and staff entry both refuse zakat before the service, because the
// yayasan's zakat status (UPZ BAZNAS, a licensed LAZ, or none) is not known and
// collecting zakat without one is an offence (UU 23/2011 Pasal 38, 41). What
// was recorded before still reads by its type.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/middleware/turnstile', () => ({
  requireTurnstile: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../donation.service', () => ({
  campaignService: {},
  mustahikService: {},
  donationService: {
    createPublic: vi.fn(async (body: { type: string; amount: number }) => ({
      id: 'd-1',
      amount: body.amount,
      type: body.type,
      status: 'PENDING',
    })),
    create: vi.fn(async (body: { type: string }) => ({ id: 'd-2', type: body.type })),
  },
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import donationRoutes from '../donation.routes';
import { donationService } from '../donation.service';

const app = express();
app.use(express.json());
app.use('/donation', donationRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockImplementation((() => ({
    type: 'access',
    permissions: [],
    sub: 'u-admin',
    roleCode: 'SDIT_ADMIN',
    unitId: 'unit-sd',
  })) as unknown as typeof verifyToken);
});

const GIFT = {
  amount: 50000,
  donorName: 'Hamba Allah',
  paymentMethod: 'BANK_TRANSFER',
  isAnonymous: false,
};

describe('the donation types a new donation may be given as', () => {
  it('are Prisma types, and none of them is zakat', () => {
    const prismaTypes = Object.values(PublicDonationType) as string[];
    for (const t of OFFERED_DONATION_TYPES) expect(prismaTypes).toContain(t);
    expect(OFFERED_DONATION_TYPES.filter((t) => t.startsWith('ZAKAT'))).toEqual([]);
    // Everything else Prisma knows is still offered — only zakat is held back.
    expect(prismaTypes.filter((t) => !t.startsWith('ZAKAT')).sort()).toEqual(
      [...OFFERED_DONATION_TYPES].sort()
    );
  });
});

describe('POST /donation/public — the Wakaf & Infaq form', () => {
  it.each(['ZAKAT_MAAL', 'ZAKAT_FITRAH'])('refuses %s before the service', async (type) => {
    const res = await request(app)
      .post('/donation/public')
      .send({ ...GIFT, type });
    expect(res.status).toBe(400);
    expect(donationService.createPublic).not.toHaveBeenCalled();
  });

  it.each(['WAKAF', 'BEASISWA', 'INFAK'])(
    'takes %s, the programmes the yayasan publishes',
    async (type) => {
      const res = await request(app)
        .post('/donation/public')
        .send({ ...GIFT, type });
      expect(res.status).toBe(201);
      expect(donationService.createPublic).toHaveBeenCalledWith(expect.objectContaining({ type }));
    }
  );
});

describe('POST /donation — staff recording a donation', () => {
  it('refuses zakat before the service', async () => {
    const res = await request(app)
      .post('/donation')
      .set('Authorization', 'Bearer t')
      .send({ ...GIFT, type: 'ZAKAT_MAAL' });
    expect(res.status).toBe(400);
    expect(donationService.create).not.toHaveBeenCalled();
  });

  it('records an offered type', async () => {
    const res = await request(app)
      .post('/donation')
      .set('Authorization', 'Bearer t')
      .send({ ...GIFT, type: 'SEDEKAH_JARIYAH' });
    expect(res.status).toBe(201);
    expect(donationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SEDEKAH_JARIYAH' })
    );
  });
});
