import { Request, Response, NextFunction } from 'express';
import * as curriculumService from './curriculum.service';
import {
  subjectQuerySchema,
  createLessonPlanSchema,
  updateLessonPlanSchema,
  lessonPlanQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleQuerySchema,
} from './curriculum.schema';
import { asyncHandler, Errors } from '@/middleware/error';
import { requireUser } from '@/middleware/auth';
import { ApiResponse } from '@/utils/response';

// =====================================
// SUBJECT CONTROLLERS
// =====================================

export async function getSubjects(req: Request, res: Response, next: NextFunction) {
  try {
    const query = subjectQuerySchema.parse(req.query);
    const result = await curriculumService.getSubjects(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

// The writes below receive bodies already parsed by validate() in
// curriculum.routes.ts, against the contract in @cipansor/shared.

export const getSubjectById = asyncHandler(async (req: Request, res: Response) => {
  const subject = await curriculumService.getSubjectById(req.params.id);
  if (!subject) throw Errors.notFound('Mata pelajaran tidak ditemukan');
  res.json(ApiResponse.success(subject));
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await curriculumService.createSubject(requireUser(req), req.body);
  res.status(201).json(ApiResponse.success(subject, 'Mata pelajaran ditambahkan'));
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await curriculumService.updateSubject(requireUser(req), req.params.id, req.body);
  res.json(ApiResponse.success(subject, 'Mata pelajaran diperbarui'));
});

export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  await curriculumService.deleteSubject(requireUser(req), req.params.id);
  res.json(ApiResponse.success(null, 'Mata pelajaran dihapus'));
});

// =====================================
// TEACHER SUBJECT CONTROLLERS (guru pengampu)
// =====================================

export const assignTeacherToSubject = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await curriculumService.assignTeacherToSubject(requireUser(req), req.body);
  res.status(201).json(ApiResponse.success(assignment, 'Guru pengampu ditugaskan'));
});

export const removeTeacherFromSubject = asyncHandler(async (req: Request, res: Response) => {
  await curriculumService.removeTeacherFromSubject(requireUser(req), req.params.id);
  res.json(ApiResponse.success(null, 'Penugasan guru pengampu diakhiri'));
});

export const getTeacherSubjects = asyncHandler(async (req: Request, res: Response) => {
  res.json(ApiResponse.success(await curriculumService.getTeacherSubjects(req.params.teacherId)));
});

// =====================================
// LESSON PLAN CONTROLLERS
// =====================================

export async function getLessonPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const query = lessonPlanQuerySchema.parse(req.query);
    const result = await curriculumService.getLessonPlans(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getLessonPlanById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const lessonPlan = await curriculumService.getLessonPlanById(id);
    if (!lessonPlan) {
      return res.status(404).json({ success: false, error: 'Lesson plan not found' });
    }
    res.json({ success: true, data: lessonPlan });
  } catch (error) {
    next(error);
  }
}

export async function createLessonPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createLessonPlanSchema.parse(req.body);
    const lessonPlan = await curriculumService.createLessonPlan(data);
    res.status(201).json({ success: true, data: lessonPlan });
  } catch (error) {
    next(error);
  }
}

export async function updateLessonPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateLessonPlanSchema.parse(req.body);
    const lessonPlan = await curriculumService.updateLessonPlan(id, data);
    res.json({ success: true, data: lessonPlan });
  } catch (error) {
    next(error);
  }
}

export async function deleteLessonPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await curriculumService.deleteLessonPlan(id);
    res.json({ success: true, message: 'Lesson plan deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function markLessonPlanComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const lessonPlan = await curriculumService.markLessonPlanComplete(id);
    res.json({ success: true, data: lessonPlan });
  } catch (error) {
    next(error);
  }
}

// =====================================
// SCHEDULE CONTROLLERS
// =====================================

export async function getSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const query = scheduleQuerySchema.parse(req.query);
    const result = await curriculumService.getSchedules(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getScheduleById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const schedule = await curriculumService.getScheduleById(id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createScheduleSchema.parse(req.body);
    const schedule = await curriculumService.createSchedule(data);
    res.status(201).json({ success: true, data: schedule });
  } catch (error: any) {
    if (error.message?.includes('conflict')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    next(error);
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateScheduleSchema.parse(req.body);
    const schedule = await curriculumService.updateSchedule(id, data);
    res.json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await curriculumService.deleteSchedule(id);
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getClassSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const { classId } = req.params;
    const { academicYearId } = req.query;
    const schedules = await curriculumService.getClassSchedule(
      classId,
      academicYearId as string | undefined
    );
    res.json({ success: true, data: schedules });
  } catch (error) {
    next(error);
  }
}

export async function getTeacherSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const { teacherId } = req.params;
    const { academicYearId } = req.query;
    const schedules = await curriculumService.getTeacherSchedule(
      teacherId,
      academicYearId as string | undefined
    );
    res.json({ success: true, data: schedules });
  } catch (error) {
    next(error);
  }
}
