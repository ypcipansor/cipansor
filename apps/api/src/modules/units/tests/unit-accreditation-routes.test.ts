import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// The accreditation routes: the role guard admits those who read or keep a
// unit's certificates (which unit each may touch is the service's check); the
// certificate travels as multipart form data and its fields are validated by
// the shared schema; the PDF comes back as a download.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../unit.service', () => ({ unitService: {} }));
vi.mock('../unit-accreditation.service', () => ({
  listAccreditations: vi.fn(async () => ({ unit: {}, canWrite: false, accreditations: [] })),
  recordAccreditation: vi.fn(async () => ({ id: 'acc-1' })),
  correctAccreditation: vi.fn(async () => ({ id: 'acc-1' })),
  deleteAccreditation: vi.fn(async () => undefined),
  certificateOf: vi.fn(async () => ({ pdf: Buffer.from('%PDF-1.7'), fileName: 'sertifikat.pdf' })),
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import unitRoutes from '../unit.routes';
import {
  certificateOf,
  listAccreditations,
  recordAccreditation,
} from '../unit-accreditation.service';

const app = express();
app.use(express.json());
app.use('/units', unitRoutes);
app.use(errorHandler);

const UNIT = '11111111-1111-4111-8111-111111111111';
const as = (roleCode: string) => ({ Authorization: `Bearer ${roleCode}` });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockImplementation(((roleCode: string) => ({
    type: 'access',
    permissions: [],
    sub: `u-${roleCode}`,
    roleCode,
    unitId: UNIT,
  })) as unknown as typeof verifyToken);
});

const post = (roleCode: string) =>
  request(app)
    .post(`/units/${UNIT}/accreditations`)
    .set(as(roleCode))
    .field('rating', 'B')
    .field('certificateNumber', '01758/32/SMP/2023')
    .field('decreeNumber', '036/BAN-PDM/SK/2023')
    .field('decreedAt', '2023-08-29')
    .field('validUntil', '2028-08-29');

describe('GET /units/:id/accreditations', () => {
  it.each(['SMPIT_ADMIN', 'SMPIT_KEPALA_SEKOLAH', 'YAYASAN_PENGAWAS', 'SUPER_ADMIN'])(
    '%s reaches it, as themselves',
    async (roleCode) => {
      const res = await request(app).get(`/units/${UNIT}/accreditations`).set(as(roleCode));
      expect(res.status).toBe(200);
      expect(listAccreditations).toHaveBeenCalledWith(
        UNIT,
        expect.objectContaining({ sub: `u-${roleCode}`, roleCode })
      );
    }
  );

  it.each(['SMPIT_GURU', 'SMPIT_TATA_USAHA', 'SMPIT_ORANG_TUA'])(
    '%s is refused: 403',
    async (roleCode) => {
      const res = await request(app).get(`/units/${UNIT}/accreditations`).set(as(roleCode));
      expect(res.status).toBe(403);
      expect(listAccreditations).not.toHaveBeenCalled();
    }
  );
});

describe('POST /units/:id/accreditations', () => {
  it('takes the fields and the PDF as multipart: 201', async () => {
    const res = await post('SMPIT_ADMIN').attach('certificate', Buffer.from('%PDF-1.7\n'), {
      filename: 'sertifikat.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(201);
    const [unitId, input, file] = vi.mocked(recordAccreditation).mock.calls[0];
    expect(unitId).toBe(UNIT);
    expect(input).toMatchObject({ rating: 'B', validUntil: '2028-08-29' });
    expect(file?.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('refuses a file that is not a PDF: 400', async () => {
    const res = await post('SMPIT_ADMIN').attach('certificate', Buffer.from('hello'), {
      filename: 'catatan.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(400);
    expect(recordAccreditation).not.toHaveBeenCalled();
  });

  it('refuses an end date before the decree: 400', async () => {
    const res = await request(app)
      .post(`/units/${UNIT}/accreditations`)
      .set(as('SMPIT_ADMIN'))
      .field('rating', 'B')
      .field('certificateNumber', '01758/32/SMP/2023')
      .field('decreeNumber', '036/BAN-PDM/SK/2023')
      .field('decreedAt', '2023-08-29')
      .field('validUntil', '2023-01-01')
      .attach('certificate', Buffer.from('%PDF-1.7\n'), {
        filename: 'sertifikat.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
    expect(recordAccreditation).not.toHaveBeenCalled();
  });

  it.each(['SMPIT_KEPALA_SEKOLAH', 'YAYASAN_KETUA', 'SMPIT_GURU'])(
    '%s does not record: 403',
    async (roleCode) => {
      const res = await post(roleCode).attach('certificate', Buffer.from('%PDF-1.7\n'), {
        filename: 'sertifikat.pdf',
        contentType: 'application/pdf',
      });
      expect(res.status).toBe(403);
      expect(recordAccreditation).not.toHaveBeenCalled();
    }
  );
});

describe('GET /units/:id/accreditations/:accreditationId/certificate', () => {
  it('sends the PDF as a download, not to be cached', async () => {
    const res = await request(app)
      .get(`/units/${UNIT}/accreditations/acc-1/certificate`)
      .set(as('SMPIT_KEPALA_SEKOLAH'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="sertifikat.pdf"');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(certificateOf).toHaveBeenCalledWith(UNIT, 'acc-1', expect.any(Object));
  });
});
