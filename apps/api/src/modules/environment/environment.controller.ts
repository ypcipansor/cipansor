import { Request, Response } from 'express';
import type { EnvironmentInfo } from '@cipansor/shared';
import { config } from '@/config';

/**
 * What the web needs to know about this copy of the system
 * GET /api/environment — public: the public site prints too.
 */
export const show = (_req: Request, res: Response) => {
  const data: EnvironmentInfo = { testCopy: config.documents.testCopy };
  res.json({ success: true, data });
};
