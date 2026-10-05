/**
 * GET /api/environment tells the web whether this copy's documents are test
 * copies, so a page printed from staging carries the same stamp as its PDFs.
 * Public: the public site prints too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { configMock } = vi.hoisted(() => ({
  configMock: { documents: { testCopy: false } },
}));
vi.mock('@/config', () => ({ config: configMock }));

import { environmentRoutes } from '..';

const app = express();
app.use('/environment', environmentRoutes);

beforeEach(() => {
  configMock.documents.testCopy = false;
});

describe('GET /environment', () => {
  it('answers without a session', async () => {
    const res = await request(app).get('/environment');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { testCopy: false } });
  });

  it('says so when this copy stamps its documents', async () => {
    configMock.documents.testCopy = true;

    const res = await request(app).get('/environment');

    expect(res.body.data).toEqual({ testCopy: true });
  });
});
