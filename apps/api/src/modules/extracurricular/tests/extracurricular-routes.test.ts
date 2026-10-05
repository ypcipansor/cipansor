import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The public list answers without a session; everything else in the module
// still needs one.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../extracurricular.service', () => ({
  extracurricularService: {
    publicList: vi.fn(async () => [
      {
        name: 'Pramuka',
        nameEn: 'Scouting',
        nameAr: null,
        category: 'SCOUTING',
        unitTypes: ['SMP_IT'],
      },
    ]),
    findAll: vi.fn(),
  },
}));

import { errorHandler } from '@/middleware/error';
import routes from '../extracurricular.routes';

const app = express();
app.use(express.json());
app.use('/extracurricular', routes);
app.use(errorHandler);

describe('extracurricular routes', () => {
  it('serves the public list with no session', async () => {
    const res = await request(app).get('/extracurricular/public');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ name: 'Pramuka', nameEn: 'Scouting' });
  });

  it('keeps the rest behind a session', async () => {
    expect((await request(app).get('/extracurricular')).status).toBe(401);
  });
});
