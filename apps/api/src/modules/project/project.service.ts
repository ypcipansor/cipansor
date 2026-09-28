import { prisma } from '@/lib/prisma';
import { ProjectStatus, TaskPriority, Prisma } from '@prisma/client';
import {
  CreateProjectInput,
  UpdateProjectInput,
  CreateProjectTaskInput,
  UpdateProjectTaskInput,
  UpdateTaskPositionInput,
  CreateColumnInput,
  UpdateColumnInput,
} from './project.schema';
import { createNotification } from '../notifications/notifications.service';
import { logger } from '../../lib/logger';

/**
 * Send a task-assignment notification without letting its failure fail the
 * request. The task is already committed when this runs, so a rejection would
 * report failure for a saved row and a retry would duplicate or re-apply it.
 * A derived message can exceed the notification size cap for a long title even
 * though the title itself is valid, so this path is reachable.
 */
async function notifyAssignmentBestEffort(
  notification: { userId: string; title: string; message: string; link: string },
  taskId: string
): Promise<void> {
  try {
    await createNotification({
      ...notification,
      type: 'INFO',
      priority: 'NORMAL',
      channels: ['IN_APP'],
      recipientType: 'INDIVIDUAL',
    });
  } catch (error) {
    logger.warn('[Project] Task saved but assignment notification failed', {
      taskId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createProject(data: CreateProjectInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: data.name,
        description: data.description,
        status: data.status || ProjectStatus.PLANNING,
        priority: data.priority as TaskPriority,
        startDate: data.startDate,
        endDate: data.endDate,
        managerId: data.managerId,
        unitId: data.unitId,
        budget: data.budget,
        members: {
          create: {
            userId: data.managerId,
            role: 'MANAGER',
          },
        },
      },
    });

    await tx.projectColumn.createMany({
      data: [
        { projectId: project.id, name: 'To Do', order: 0, color: '#e2e8f0' },
        { projectId: project.id, name: 'In Progress', order: 1, color: '#3b82f6' },
        { projectId: project.id, name: 'Done', order: 2, color: '#22c55e' },
      ],
    });

    return project;
  });
}

export async function getProjects(query: {
  unitId?: string;
  managerId?: string;
  status?: ProjectStatus;
}) {
  return prisma.project.findMany({
    where: {
      ...(query.unitId && { unitId: query.unitId }),
      ...(query.managerId && { members: { some: { userId: query.managerId } } }),
      ...(query.status && { status: query.status }),
    },
    include: {
      manager: { select: { id: true, name: true, email: true } },
      _count: { select: { tasks: true, members: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getProjectById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, email: true } },
      columns: {
        orderBy: { order: 'asc' },
        include: {
          tasks: {
            orderBy: { order: 'asc' },
            include: {
              assignee: { select: { id: true, name: true } },
              _count: { select: { comments: true } },
            },
          },
        },
      },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function updateProject(id: string, data: UpdateProjectInput) {
  return prisma.project.update({
    where: { id },
    data: {
      ...data,
      ...(data.priority && { priority: data.priority as TaskPriority }),
    },
  });
}

export async function deleteProject(id: string) {
  return prisma.project.delete({ where: { id } });
}

// Tasks

export async function getTaskById(id: string) {
  return prisma.projectTask.findUnique({
    where: { id },
    include: {
      project: true,
    },
  });
}

export async function createTask(
  projectId: string,
  data: CreateProjectTaskInput,
  creatorId: string
) {
  let columnId = data.columnId;
  if (!columnId) {
    const firstCol = await prisma.projectColumn.findFirst({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    if (firstCol) columnId = firstCol.id;
  }

  const task = await prisma.$transaction(async (tx) => {
    // Get max order in column
    const lastTask = await tx.projectTask.findFirst({
      where: { columnId },
      orderBy: { order: 'desc' },
    });
    const newOrder = lastTask ? lastTask.order + 1 : 0;

    return tx.projectTask.create({
      data: {
        projectId,
        columnId,
        title: data.title,
        description: data.description,
        priority: data.priority as TaskPriority,
        dueDate: data.dueDate,
        assigneeId: data.assigneeId,
        order: newOrder,
      },
      include: {
        project: { select: { name: true } },
      },
    });
  });

  if (data.assigneeId && data.assigneeId !== creatorId) {
    // Best-effort, like every other external side effect here: the task is
    // already committed above, so a notification failure must not turn a saved
    // task into a failed request (the caller would retry and duplicate it).
    await notifyAssignmentBestEffort(
      {
        userId: data.assigneeId,
        title: 'New Task Assigned',
        message: `You have been assigned to task "${task.title}" in project "${task.project.name}"`,
        link: `/project/${projectId}`,
      },
      task.id
    );
  }

  return task;
}

export async function updateTask(id: string, data: UpdateProjectTaskInput, updaterId: string) {
  const existingTask = await prisma.projectTask.findUnique({
    where: { id },
    select: { assigneeId: true },
  });

  const task = await prisma.projectTask.update({
    where: { id },
    data: {
      ...data,
      ...(data.priority && { priority: data.priority as TaskPriority }),
    },
    include: {
      project: { select: { name: true } },
    },
  });

  // Only notify if assignee has actually changed and is not the one making the update
  if (
    data.assigneeId &&
    data.assigneeId !== updaterId &&
    data.assigneeId !== existingTask?.assigneeId
  ) {
    // Best-effort, same as `createTask`: the reassignment is already committed,
    // so a notification failure must not report the update as failed.
    await notifyAssignmentBestEffort(
      {
        userId: data.assigneeId,
        title: 'Task Assignment Updated',
        message: `You have been assigned to task "${task.title}" in project "${task.project.name}"`,
        link: `/project/${task.projectId}`,
      },
      task.id
    );
  }

  return task;
}

export async function updateTaskPosition(id: string, data: UpdateTaskPositionInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.projectTask.findUnique({ where: { id } });
    if (!task) throw new Error('Task not found');

    const oldColId = task.columnId;
    const oldOrder = task.order;
    const newColId = data.columnId;
    const newOrder = data.order;

    if (oldColId === newColId) {
      if (oldOrder < newOrder) {
        await tx.projectTask.updateMany({
          where: { columnId: oldColId, order: { gt: oldOrder, lte: newOrder } },
          data: { order: { decrement: 1 } },
        });
      } else if (oldOrder > newOrder) {
        await tx.projectTask.updateMany({
          where: { columnId: oldColId, order: { gte: newOrder, lt: oldOrder } },
          data: { order: { increment: 1 } },
        });
      }
    } else {
      if (oldColId) {
        await tx.projectTask.updateMany({
          where: { columnId: oldColId, order: { gt: oldOrder } },
          data: { order: { decrement: 1 } },
        });
      }
      await tx.projectTask.updateMany({
        where: { columnId: newColId, order: { gte: newOrder } },
        data: { order: { increment: 1 } },
      });
    }

    return tx.projectTask.update({
      where: { id },
      data: { columnId: newColId, order: newOrder },
    });
  });
}

export async function deleteTask(id: string) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.projectTask.findUnique({
      where: { id },
      select: { columnId: true, order: true },
    });

    if (task && task.columnId) {
      await tx.projectTask.updateMany({
        where: {
          columnId: task.columnId,
          order: { gt: task.order },
        },
        data: {
          order: { decrement: 1 },
        },
      });
    }

    return tx.projectTask.delete({ where: { id } });
  });
}

// Columns

export async function getColumnById(id: string) {
  return prisma.projectColumn.findUnique({
    where: { id },
    include: {
      project: true,
    },
  });
}

export async function createColumn(projectId: string, data: CreateColumnInput) {
  if (data.order === undefined) {
    const lastCol = await prisma.projectColumn.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
    });
    data.order = lastCol ? lastCol.order + 1 : 0;
  }

  return prisma.projectColumn.create({
    data: {
      projectId,
      ...data,
    } as Prisma.ProjectColumnUncheckedCreateInput,
  });
}

export async function updateColumn(id: string, data: UpdateColumnInput) {
  return prisma.projectColumn.update({
    where: { id },
    data,
  });
}

export async function deleteColumn(id: string) {
  return prisma.projectColumn.delete({ where: { id } });
}
