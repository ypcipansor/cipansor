import { Request, Response, NextFunction } from 'express';
import * as dormitoryService from './dormitories.service';
import {
  queryDormitorySchema,
  queryRoomSchema,
  queryRoomAssignmentSchema,
} from './dormitories.schema';
import { Errors, asyncHandler } from '../../middleware/error';
import { ApiResponse } from '../../utils/response';
import { requireUser } from '../../middleware/auth';

// =====================================
// DORMITORY CONTROLLERS
// =====================================

// The writes receive bodies already parsed by validate() in
// dormitories.routes.ts, against the contract in @cipansor/shared.

export const createDormitory = asyncHandler(async (req: Request, res: Response) => {
  const dormitory = await dormitoryService.createDormitory(req.body);
  res.status(201).json(ApiResponse.success(dormitory, 'Asrama ditambahkan'));
});

export async function getStudentsByMusyrif(req: Request, res: Response, next: NextFunction) {
  try {
    // Current user is guaranteed by authenticate middleware
    // req.user is populated, but we can also use req.user.id if available on the type
    // In this codebase, usually it's attached to req.user
    // But since I don't see the type def, I'll cast it safely
    const userId = req.user?.id;
    if (!userId) {
      throw Errors.unauthorized('User not authenticated');
    }

    const students = await dormitoryService.getStudentsByMusyrif(userId);
    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDormitories(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryDormitorySchema.parse(res.locals.validatedQuery || req.query);
    const result = await dormitoryService.getDormitories(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDormitoryById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const dormitory = await dormitoryService.getDormitoryById(id);
    if (!dormitory) {
      throw Errors.notFound('Dormitory not found');
    }
    res.json({
      success: true,
      data: dormitory,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDormitoryStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const stats = await dormitoryService.getDormitoryStats(id);
    if (!stats) {
      throw Errors.notFound('Dormitory not found');
    }
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

export const updateDormitory = asyncHandler(async (req: Request, res: Response) => {
  const dormitory = await dormitoryService.updateDormitory(req.params.id, req.body);
  res.json(ApiResponse.success(dormitory, 'Asrama diperbarui'));
});

export const deleteDormitory = asyncHandler(async (req: Request, res: Response) => {
  await dormitoryService.deleteDormitory(req.params.id);
  res.json(ApiResponse.success(null, 'Asrama dihapus'));
});

// =====================================
// ROOM CONTROLLERS
// =====================================

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = await dormitoryService.createRoom(req.body);
  res.status(201).json(ApiResponse.success(room, 'Kamar ditambahkan'));
});

export async function getRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryRoomSchema.parse(res.locals.validatedQuery || req.query);
    const result = await dormitoryService.getRooms(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRoomById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await dormitoryService.assertRoomAccess(requireUser(req), id);
    const room = await dormitoryService.getRoomById(id);
    if (!room) {
      throw Errors.notFound('Room not found');
    }
    res.json({
      success: true,
      data: room,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRoomSocialAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await dormitoryService.assertRoomAccess(requireUser(req), id);

    const analytics = await dormitoryService.getRoomSocialAnalytics(id);
    if (!analytics) {
      throw Errors.notFound('Room not found');
    }
    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRoomOccupancy(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await dormitoryService.assertRoomAccess(requireUser(req), id);
    const occupancy = await dormitoryService.getRoomOccupancy(id);
    if (!occupancy) {
      throw Errors.notFound('Room not found');
    }
    res.json({
      success: true,
      data: occupancy,
    });
  } catch (error) {
    next(error);
  }
}

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = await dormitoryService.updateRoom(req.params.id, req.body);
  res.json(ApiResponse.success(room, 'Kamar diperbarui'));
});

export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  await dormitoryService.deleteRoom(req.params.id);
  res.json(ApiResponse.success(null, 'Kamar dihapus'));
});

// =====================================
// ROOM ASSIGNMENT CONTROLLERS
// =====================================

export const createRoomAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await dormitoryService.createRoomAssignment(req.body);
  res.status(201).json(ApiResponse.success(assignment, 'Santri ditempatkan'));
});

export async function getRoomAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryRoomAssignmentSchema.parse(res.locals.validatedQuery || req.query);
    const result = await dormitoryService.getRoomAssignments(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRoomAssignmentById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const assignment = await dormitoryService.getRoomAssignmentById(id);
    if (!assignment) {
      throw Errors.notFound('Room assignment not found');
    }
    res.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
}

export const updateRoomAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await dormitoryService.updateRoomAssignment(req.params.id, req.body);
  res.json(ApiResponse.success(assignment, 'Penempatan diperbarui'));
});

export const endRoomAssignment = asyncHandler(async (req: Request, res: Response) => {
  await dormitoryService.endRoomAssignment(req.params.id);
  res.json(ApiResponse.success(null, 'Santri dikeluarkan dari kamar'));
});
