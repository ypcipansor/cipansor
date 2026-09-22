import { z } from 'zod';
import { uploadedFileRefListSchema } from '@cipansor/shared';

import { ComplaintCategory, ComplaintStatus } from '@prisma/client';

export const createComplaintSchema = z.object({
  category: z.nativeEnum(ComplaintCategory),
  subject: z.string().min(5).max(255),
  description: z.string().min(20),
  location: z.string().optional(),
  // Si-Peka: precise facility location for damage reports
  buildingId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  isAnonymous: z.boolean().optional(),
  attachments: uploadedFileRefListSchema.optional(),
  unitId: z.string().uuid().optional(), // Optional, required for SUPER_ADMIN if token unitId is missing
});

export const updateComplaintStatusSchema = z.object({
  status: z.nativeEnum(ComplaintStatus),
  resolution: z.string().optional(),
});

export const addCommentSchema = z.object({
  content: z.string().min(1),
  isInternal: z.boolean().optional(),
});

export const assignHandlerSchema = z.object({
  handlerId: z.string().uuid(),
});
