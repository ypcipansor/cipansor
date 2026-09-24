import { requireUser } from '../../middleware/auth';
import { Request, Response, NextFunction } from 'express';
import * as service from './alumni.service';
import {
  createAlumniSchema,
  updateAlumniSchema,
  alumniQuerySchema,
  convertFromStudentSchema,
  createCareerSchema,
  updateCareerSchema,
  createEducationSchema,
  updateEducationSchema,
  createDonationSchema,
  updateDonationSchema,
  donationQuerySchema,
  createEventSchema,
  updateEventSchema,
  eventQuerySchema,
  registerEventSchema,
  updateAttendeeStatusSchema,
} from './alumni.schema';
import { alumniUnitScope, redactAlumniFor } from './alumni-access';

// ==================== ALUMNI ====================

export async function getAlumni(req: Request, res: Response, next: NextFunction) {
  try {
    const query = alumniQuerySchema.parse(req.query);
    const result = await service.getAlumni(query);
    // Direktori untuk semua akun; kontak dan data diri hanya untuk pembaca yang
    // berhak atas unit baris itu.
    const user = requireUser(req);
    res.json({
      success: true,
      ...result,
      data: result.data.map((alumni) => redactAlumniFor(user, alumni)),
    });
  } catch (error) {
    next(error);
  }
}

export async function getOutcomeAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const user = requireUser(req);

    // Nilai rata-rata dan capaian tahfidz per NAMA alumni: lingkup unit yang
    // sama dengan data diri. Yayasan (tanpa unit) dulu tertolak di sini karena
    // pemeriksaannya hanya mengenal SUPER_ADMIN.
    const scope = alumniUnitScope(user);
    const requested = typeof unitId === 'string' && unitId ? unitId : undefined;
    if (scope !== null && requested && requested !== scope) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access to this unit is not allowed' },
      });
    }
    const effectiveUnitId = scope ?? requested;

    const data = await service.getAlumniOutcomeAnalytics(effectiveUnitId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAlumniById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const alumni = await service.getAlumniById(id);
    if (!alumni) {
      return res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: 'Alumni not found' } });
    }
    res.json({ success: true, data: redactAlumniFor(requireUser(req), alumni) });
  } catch (error) {
    next(error);
  }
}

export async function createAlumni(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAlumniSchema.parse(req.body);
    const alumni = await service.createAlumni(data, requireUser(req));
    res.status(201).json({ success: true, data: alumni });
  } catch (error) {
    next(error);
  }
}

export async function updateAlumni(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateAlumniSchema.parse(req.body);
    const alumni = await service.updateAlumni(id, data, requireUser(req));
    res.json({ success: true, data: alumni });
  } catch (error) {
    next(error);
  }
}

export async function deleteAlumni(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await service.deleteAlumni(id, requireUser(req));
    res.json({ success: true, message: 'Alumni deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function convertFromStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = req.params;
    const data = convertFromStudentSchema.parse(req.body);
    const alumni = await service.convertFromStudent(studentId, data, requireUser(req));
    res.status(201).json({ success: true, data: alumni });
  } catch (error) {
    next(error);
  }
}

export async function getAlumniStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const stats = await service.getAlumniStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getTracerStudyStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const stats = await service.getTracerStudyStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getPlacements(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const data = await service.getPlacements(unitId as string | undefined);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ==================== CAREER ====================

export async function getCareersByAlumni(req: Request, res: Response, next: NextFunction) {
  try {
    const { alumniId } = req.params;
    const careers = await service.getCareersByAlumni(alumniId);
    res.json({ success: true, data: careers });
  } catch (error) {
    next(error);
  }
}

export async function createCareer(req: Request, res: Response, next: NextFunction) {
  try {
    const { alumniId } = req.params;
    const data = createCareerSchema.parse(req.body);
    const career = await service.createCareer(alumniId, data, requireUser(req));
    res.status(201).json({ success: true, data: career });
  } catch (error) {
    next(error);
  }
}

export async function updateCareer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateCareerSchema.parse(req.body);
    const career = await service.updateCareer(id, data, requireUser(req));
    res.json({ success: true, data: career });
  } catch (error) {
    next(error);
  }
}

export async function deleteCareer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await service.deleteCareer(id, requireUser(req));
    res.json({ success: true, message: 'Career deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// ==================== EDUCATION ====================

export async function getEducationsByAlumni(req: Request, res: Response, next: NextFunction) {
  try {
    const { alumniId } = req.params;
    const educations = await service.getEducationsByAlumni(alumniId);
    res.json({ success: true, data: educations });
  } catch (error) {
    next(error);
  }
}

export async function createEducation(req: Request, res: Response, next: NextFunction) {
  try {
    const { alumniId } = req.params;
    const data = createEducationSchema.parse(req.body);
    const education = await service.createEducation(alumniId, data, requireUser(req));
    res.status(201).json({ success: true, data: education });
  } catch (error) {
    next(error);
  }
}

export async function updateEducation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateEducationSchema.parse(req.body);
    const education = await service.updateEducation(id, data, requireUser(req));
    res.json({ success: true, data: education });
  } catch (error) {
    next(error);
  }
}

export async function deleteEducation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await service.deleteEducation(id, requireUser(req));
    res.json({ success: true, message: 'Education deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// ==================== DONATIONS ====================

export async function getDonations(req: Request, res: Response, next: NextFunction) {
  try {
    const query = donationQuerySchema.parse(req.query);
    const result = await service.getDonations(query, requireUser(req));
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function createDonation(req: Request, res: Response, next: NextFunction) {
  try {
    const { alumniId } = req.params;
    const data = createDonationSchema.parse(req.body);
    const donation = await service.createDonation(alumniId, data, requireUser(req));
    res.status(201).json({ success: true, data: donation });
  } catch (error) {
    next(error);
  }
}

export async function updateDonation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateDonationSchema.parse(req.body);
    const donation = await service.updateDonation(id, data, requireUser(req));
    res.json({ success: true, data: donation });
  } catch (error) {
    next(error);
  }
}

export async function deleteDonation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await service.deleteDonation(id, requireUser(req));
    res.json({ success: true, message: 'Donation deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// ==================== EVENTS ====================

export async function getEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const query = eventQuerySchema.parse(req.query);
    const result = await service.getEvents(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getEventById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const event = await service.getEventById(id);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: 'Event not found' } });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
}

export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createEventSchema.parse(req.body);
    const event = await service.createEvent(data, requireUser(req));
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateEventSchema.parse(req.body);
    const event = await service.updateEvent(id, data, requireUser(req));
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await service.deleteEvent(id, requireUser(req));
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// ==================== EVENT ATTENDEES ====================

export async function registerForEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { eventId } = req.params;
    const data = registerEventSchema.parse(req.body);
    const attendee = await service.registerForEvent(eventId, data);
    res.status(201).json({ success: true, data: attendee });
  } catch (error) {
    next(error);
  }
}

export async function updateAttendeeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateAttendeeStatusSchema.parse(req.body);
    const attendee = await service.updateAttendeeStatus(id, data, requireUser(req));
    res.json({ success: true, data: attendee });
  } catch (error) {
    next(error);
  }
}

export async function cancelRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await service.cancelRegistration(id, requireUser(req));
    res.json({ success: true, message: 'Registration cancelled successfully' });
  } catch (error) {
    next(error);
  }
}
