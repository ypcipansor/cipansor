import { Request, Response, NextFunction } from 'express';
import { SecretsService } from './secrets.service';
import { createSecretSchema } from './secrets.validation';
import httpStatus from 'http-status';

export const listSecrets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only SUPER_ADMIN can see global secrets. UNIT_ADMIN sees unit secrets.
    // For now, allow filtering by unitId in query.
    const unitId = req.query.unitId as string | undefined;
    const secrets = await SecretsService.list(unitId);
    res.json({ data: secrets });
  } catch (error) {
    next(error);
  }
};

export const upsertSecret = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createSecretSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(httpStatus.BAD_REQUEST).json({ errors: validation.error.format() });
      return;
    }

    const result = await SecretsService.upsert(validation.data);
    res.status(httpStatus.OK).json({ data: { id: result.id, key: result.key } });
  } catch (error) {
    next(error);
  }
};

export const deleteSecret = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await SecretsService.delete(id);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
};
