import { Request, Response, NextFunction } from 'express';
import * as service from './admissions.service';
import {
  createAdmissionPeriodSchema,
  updateAdmissionPeriodSchema,
  createRegistrantSchema,
  updateRegistrantSchema,
  updateRegistrantScoreSchema,
  updateRegistrantStatusSchema,
  recordRegistrationFeeSchema,
  createRegistrantDocumentSchema,
  verifyDocumentSchema,
  trackRegistrantQuerySchema,
} from './admissions.schema';
import { Errors } from '../../middleware/error';
import { z } from 'zod';
import { requireUser } from '../../middleware/auth';

// =====================================
// ADMISSION PERIOD CONTROLLERS
// =====================================

export async function getAdmissionPeriods(req: Request, res: Response, next: NextFunction) {
  try {
    const query = res.locals.validatedQuery;
    const result = await service.getAdmissionPeriods(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getAdmissionPeriodById(req: Request, res: Response, next: NextFunction) {
  try {
    const period = await service.getAdmissionPeriodById(req.params.id);
    if (!period) {
      throw Errors.notFound('Admission period');
    }
    res.json({ success: true, data: period });
  } catch (error) {
    next(error);
  }
}

export async function createAdmissionPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAdmissionPeriodSchema.parse(req.body);
    const period = await service.createAdmissionPeriod(data);
    res.status(201).json({ success: true, data: period });
  } catch (error) {
    next(error);
  }
}

export async function updateAdmissionPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateAdmissionPeriodSchema.parse(req.body);
    const period = await service.updateAdmissionPeriod(req.params.id, data);
    res.json({ success: true, data: period });
  } catch (error) {
    next(error);
  }
}

export async function deleteAdmissionPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAdmissionPeriod(req.params.id);
    res.json({ success: true, message: 'Admission period deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getAdmissionPeriodStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await service.getAdmissionPeriodStats(req.params.id);
    if (!stats) {
      throw Errors.notFound('Admission period');
    }
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

// =====================================
// REGISTRANT CONTROLLERS
// =====================================

export async function getRegistrants(req: Request, res: Response, next: NextFunction) {
  try {
    const query = res.locals.validatedQuery;
    const result = await service.getRegistrants(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getRegistrantById(req: Request, res: Response, next: NextFunction) {
  try {
    const registrant = await service.getRegistrantById(req.params.id);
    if (!registrant) {
      throw Errors.notFound('Registrant');
    }
    res.json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function createRegistrant(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRegistrantSchema.parse(req.body);
    const registrant = await service.createRegistrant(data);
    res.status(201).json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function updateRegistrant(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateRegistrantSchema.parse(req.body);
    const registrant = await service.updateRegistrant(req.params.id, data);
    res.json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function updateRegistrantScore(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateRegistrantScoreSchema.parse(req.body);
    const registrant = await service.updateRegistrantScore(req.params.id, data);
    res.json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function recordRegistrationFee(req: Request, res: Response, next: NextFunction) {
  try {
    const data = recordRegistrationFeeSchema.parse(req.body);
    const user = requireUser(req);
    const registrant = await service.recordRegistrationFee(req.params.id, data, user.id);
    res.json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function updateRegistrantStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateRegistrantStatusSchema.parse(req.body);
    const registrant = await service.updateRegistrantStatus(req.params.id, data);
    res.json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function enrollRegistrant(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      nisn: z.string().optional(),
      nik: z.string().optional(),
      classId: z.string().optional(),
      roomId: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const result = await service.enrollRegistrant(req.params.id, {
      nisn: data.nisn,
      nik: data.nik,
      classId: data.classId,
      roomId: data.roomId,
    });
    res.json({
      success: true,
      data: result,
      message: 'Registrant enrolled successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteRegistrant(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteRegistrant(req.params.id);
    res.json({ success: true, message: 'Registrant deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// =====================================
// DOCUMENT CONTROLLERS
// =====================================

export async function getRegistrantDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const documents = await service.getRegistrantDocuments(req.params.registrantId);
    res.json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
}

export async function createRegistrantDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRegistrantDocumentSchema.parse({
      ...req.body,
      registrantId: req.params.registrantId,
    });
    const document = await service.createRegistrantDocument(data);
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
}

export async function verifyDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const data = verifyDocumentSchema.parse(req.body);
    const document = await service.verifyDocument(req.params.id, data.isVerified, data.notes);
    res.json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
}

export async function deleteRegistrantDocument(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteRegistrantDocument(req.params.id);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// =====================================
// PUBLIC CONTROLLERS (no authentication)
// =====================================

export async function getPublicActiveAdmissionPeriod(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const period = await service.findPublicActivePeriod();
    res.json({ success: true, data: period });
  } catch (error) {
    next(error);
  }
}

export async function getPublicUnits(_req: Request, res: Response, next: NextFunction) {
  try {
    const { prisma } = await import('../../lib/prisma');
    const units = await prisma.unit.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: units });
  } catch (error) {
    next(error);
  }
}

export async function createPublicRegistrant(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRegistrantSchema.parse(req.body);

    const { prisma } = await import('../../lib/prisma');
    const period = await prisma.admissionPeriod.findUnique({
      where: { id: data.admissionPeriodId },
      select: { isActive: true, startDate: true, endDate: true },
    });

    if (!period) {
      throw Errors.notFound('Admission period');
    }

    const now = new Date();
    if (!period.isActive || now < period.startDate || now > period.endDate) {
      throw Errors.badRequest('Admission period is not open for registration');
    }

    const registrant = await service.createRegistrant(data);
    res.status(201).json({
      success: true,
      data: {
        id: registrant.id,
        registrationNo: registrant.registrationNo,
        fullName: registrant.fullName,
        status: registrant.status,
        createdAt: registrant.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function trackPublicRegistrantStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { registrationNo, birthDate } = trackRegistrantQuerySchema.parse(req.query);

    const registrant = await service.getRegistrantTrackingInfo(registrationNo, birthDate);
    if (!registrant) {
      throw Errors.notFound('Registrant with provided details');
    }

    res.json({ success: true, data: registrant });
  } catch (error) {
    next(error);
  }
}

export async function getPriorityLeads(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const user = requireUser(req);

    let effectiveUnitId = unitId as string | undefined;
    if (user && user.role !== 'SUPER_ADMIN') {
      if (!user.unitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
      if (effectiveUnitId && effectiveUnitId !== user.unitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
      effectiveUnitId = user.unitId;
    }

    const { getPriorityLeads: getLeads } = await import('./lead-scoring.service');
    const leads = await getLeads(effectiveUnitId);
    res.json({ success: true, data: leads });
  } catch (error) {
    next(error);
  }
}
