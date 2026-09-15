import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CBTController } from '../cbt.controller';
import { CBTService } from '../cbt.service';
import { SECURITY_EVENT_TYPES } from '@cipansor/shared';

vi.mock('../cbt.service');

describe('CBT Controller', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      user: { id: 'user-std-1', role: 'STUDENT' },
      params: { attemptId: 'attempt-1' },
      body: {},
    };
    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  describe('recordSecurityLog', () => {
    it('should validate eventType and delegate to CBTService', async () => {
      req.body = { eventType: 'TAB_SWITCH', details: { note: 'Minimizing browser' } };
      vi.mocked(CBTService.recordSecurityLog).mockResolvedValue({ id: 'log-1' } as any);

      await CBTController.recordSecurityLog(req, res, next);

      expect(CBTService.recordSecurityLog).toHaveBeenCalledWith(
        'attempt-1',
        'user-std-1',
        { type: 'TAB_SWITCH', details: { note: 'Minimizing browser' } }
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'log-1' } });
    });

    it('menolak jenis kejadian yang tidak dikenal di batas, bukan di basis data', async () => {
      // Tanpa validasi di sini, nama yang tidak dikenal sampai ke kolom `type`
      // dan ditolak CHECK constraint — yang muncul sebagai 500, bukan 400 yang
      // menyebut medannya. Servisnya pun tidak boleh tersentuh.
      req.body = { eventType: 'SCREENSHOT', details: { note: 'tangkapan layar' } };

      await CBTController.recordSecurityLog(req, res, next);

      expect(CBTService.recordSecurityLog).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const passed = next.mock.calls[0][0];
      expect(String(passed?.name ?? passed)).toMatch(/ZodError/i);
    });

    it('menerima setiap nilai yang ada di daftar bersama', async () => {
      vi.mocked(CBTService.recordSecurityLog).mockResolvedValue({ id: 'log-x' } as any);

      for (const eventType of SECURITY_EVENT_TYPES) {
        vi.clearAllMocks();
        vi.mocked(CBTService.recordSecurityLog).mockResolvedValue({ id: 'log-x' } as any);
        req.body = { eventType };

        await CBTController.recordSecurityLog(req, res, next);

        expect(next, `${eventType} seharusnya diterima`).not.toHaveBeenCalled();
        expect(CBTService.recordSecurityLog).toHaveBeenCalledWith(
          'attempt-1',
          'user-std-1',
          expect.objectContaining({ type: eventType })
        );
      }
    });

    it('should call next on service failure', async () => {
      req.body = { eventType: 'TAB_SWITCH' };
      const err = new Error('Service error');
      vi.mocked(CBTService.recordSecurityLog).mockRejectedValue(err);

      await CBTController.recordSecurityLog(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
