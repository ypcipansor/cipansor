import { Request, Response, NextFunction } from 'express';
import * as curriculumService from './curriculum.service';
import {
  createCurriculumSchema,
  updateCurriculumSchema,
  curriculumQuerySchema,
  addCurriculumSubjectSchema,
  createSubjectSchema,
  updateSubjectSchema,
  subjectQuerySchema,
  assignTeacherSubjectSchema,
  createLessonPlanSchema,
  updateLessonPlanSchema,
  lessonPlanQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleQuerySchema,
} from './curriculum.schema';

// =====================================
// CURRICULUM CONTROLLERS
// =====================================

export async function getCurriculums(req: Request, res: Response, next: NextFunction) {
  try {
    const query = curriculumQuerySchema.parse(req.query);
    const result = await curriculumService.getCurriculums(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getCurriculumById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const curriculum = await curriculumService.getCurriculumById(id);
    if (!curriculum) {
      return res.status(404).json({ success: false, error: 'Curriculum not found' });
    }
    res.json({ success: true, data: curriculum });
  } catch (error) {
    next(error);
  }
}

export async function createCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createCurriculumSchema.parse(req.body);
    const curriculum = await curriculumService.createCurriculum(data);
    res.status(201).json({ success: true, data: curriculum });
  } catch (error) {
    next(error);
  }
}

export async function updateCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateCurriculumSchema.parse(req.body);
    const curriculum = await curriculumService.updateCurriculum(id, data);
    res.json({ success: true, data: curriculum });
  } catch (error) {
    next(error);
  }
}

export async function deleteCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await curriculumService.deleteCurriculum(id);
    res.json({ success: true, message: 'Curriculum deleted' });
  } catch (error) {
    next(error);
  }
}

export async function addCurriculumSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = addCurriculumSubjectSchema.parse(req.body);
    const curriculumSubject = await curriculumService.addCurriculumSubject(id, data);
    res.status(201).json({ success: true, data: curriculumSubject });
  } catch (error) {
    next(error);
  }
}

export async function removeCurriculumSubject(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id, subjectId } = req.params;
    const removed = await curriculumService.removeCurriculumSubject(id, subjectId);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Curriculum subject not found' });
    }
    res.json({ success: true, message: 'Subject removed from curriculum' });
  } catch (error) {
    next(error);
  }
}

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

export async function getSubjectById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const subject = await curriculumService.getSubjectById(id);
    if (!subject) {
      return res.status(404).json({ success: false, error: 'Subject not found' });
    }
    res.json({ success: true, data: subject });
  } catch (error) {
    next(error);
  }
}

export async function createSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSubjectSchema.parse(req.body);
    const subject = await curriculumService.createSubject(data);
    res.status(201).json({ success: true, data: subject });
  } catch (error) {
    next(error);
  }
}

export async function updateSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateSubjectSchema.parse(req.body);
    const subject = await curriculumService.updateSubject(id, data);
    res.json({ success: true, data: subject });
  } catch (error) {
    next(error);
  }
}

export async function deleteSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await curriculumService.deleteSubject(id);
    res.json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// =====================================
// TEACHER SUBJECT CONTROLLERS
// =====================================

export async function assignTeacherToSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = assignTeacherSubjectSchema.parse(req.body);
    const assignment = await curriculumService.assignTeacherToSubject(data);
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
}

export async function removeTeacherFromSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await curriculumService.removeTeacherFromSubject(id);
    res.json({ success: true, message: 'Teacher assignment removed' });
  } catch (error) {
    next(error);
  }
}

export async function getTeacherSubjects(req: Request, res: Response, next: NextFunction) {
  try {
    const { teacherId } = req.params;
    const subjects = await curriculumService.getTeacherSubjects(teacherId);
    res.json({ success: true, data: subjects });
  } catch (error) {
    next(error);
  }
}

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
