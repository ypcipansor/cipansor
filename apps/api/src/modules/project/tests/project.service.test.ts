import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../../lib/prisma';
import * as projectService from '../project.service';
import * as notificationService from '../../notifications/notifications.service';
import { ProjectStatus, TaskPriority } from '@prisma/client';

// Mock all external dependencies
vi.mock('../../../lib/prisma', () => ({
  prisma: {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projectColumn: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    projectTask: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../notifications/notifications.service', () => ({
  createNotification: vi.fn(),
}));

describe('Project Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('should create project with default columns', async () => {
      const dto = {
        unitId: 'unit-1',
        name: 'PPDB 2026',
        description: 'Penerimaan santri baru',
        managerId: 'manager-1',
        startDate: new Date(),
        endDate: new Date(),
        status: ProjectStatus.PLANNING,
        priority: TaskPriority.HIGH,
      };

      const mockProject = { id: 'proj-1', ...dto };
      vi.mocked(prisma.project.create).mockResolvedValue(mockProject as any);
      vi.mocked(prisma.projectColumn.createMany).mockResolvedValue({ count: 3 } as any);

      const result = await projectService.createProject(dto as any);

      expect(prisma.project.create).toHaveBeenCalled();
      expect(prisma.projectColumn.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: 'To Do', order: 0 }),
          expect.objectContaining({ name: 'In Progress', order: 1 }),
          expect.objectContaining({ name: 'Done', order: 2 }),
        ],
      });
      expect(result).toEqual(mockProject);
    });
  });

  describe('createTask', () => {
    it('should assign to first column if no column provided and notify assignee', async () => {
      const dto = {
        title: 'Design brosur',
        description: 'Buat desain untuk PPDB',
        assigneeId: 'user-2',
        priority: 'NORMAL',
      };

      const mockCol = { id: 'col-1', order: 0 };
      const mockTask = {
        id: 'task-1',
        ...dto,
        columnId: 'col-1',
        order: 0,
        project: { name: 'PPDB 2026' },
      };

      vi.mocked(prisma.projectColumn.findFirst).mockResolvedValue(mockCol as any);
      vi.mocked(prisma.projectTask.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.projectTask.create).mockResolvedValue(mockTask as any);

      const result = await projectService.createTask('proj-1', dto as any, 'user-1');

      expect(prisma.projectColumn.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { order: 'asc' },
      });

      expect(prisma.projectTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          columnId: 'col-1',
          order: 0, // Since lastTask was null
          assigneeId: 'user-2',
        }),
        include: { project: { select: { name: true } } },
      });

      // Should notify since assignee != creator
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          title: 'Tugas baru untuk Anda',
        })
      );

      expect(result).toEqual(mockTask);
    });
  });

  describe('a notification that fails after the task is saved', () => {
    // The task is saved before its assignee is told. A failure to tell them —
    // the notifications table unavailable, say — must not answer the request
    // with an error: the caller would retry and save the task twice.
    const saved = {
      id: 'task-2',
      title: 'Design brosur',
      projectId: 'proj-1',
      assigneeId: 'user-2',
      project: { name: 'PPDB 2026' },
    };

    it('createTask still returns the saved task', async () => {
      vi.mocked(prisma.projectColumn.findFirst).mockResolvedValue({ id: 'col-1', order: 0 } as any);
      vi.mocked(prisma.projectTask.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.projectTask.create).mockResolvedValue(saved as any);
      vi.mocked(notificationService.createNotification).mockRejectedValue(
        new Error('notifications unavailable')
      );

      const result = await projectService.createTask(
        'proj-1',
        { title: 'Design brosur', assigneeId: 'user-2', priority: 'NORMAL' } as any,
        'user-1'
      );

      expect(result).toEqual(saved);
      expect(prisma.projectTask.create).toHaveBeenCalledTimes(1);
    });

    it('updateTask still returns the saved reassignment, and tells the new assignee in Indonesian', async () => {
      vi.mocked(prisma.projectTask.findUnique).mockResolvedValue({ assigneeId: 'user-1' } as any);
      vi.mocked(prisma.projectTask.update).mockResolvedValue(saved as any);
      vi.mocked(notificationService.createNotification).mockRejectedValue(
        new Error('notifications unavailable')
      );

      const result = await projectService.updateTask(
        'task-2',
        { assigneeId: 'user-2' } as any,
        'user-3'
      );

      expect(result).toEqual(saved);
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          title: 'Tugas dialihkan kepada Anda',
          message: 'Anda ditugaskan pada "Design brosur" di proyek "PPDB 2026"',
          link: '/project/proj-1',
        })
      );
    });
  });

  describe('updateTaskPosition', () => {
    it('should reorder tasks in the same column', async () => {
      const mockTask = { id: 'task-1', columnId: 'col-1', order: 0 };

      vi.mocked(prisma.projectTask.findUnique).mockResolvedValue(mockTask as any);
      vi.mocked(prisma.projectTask.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.projectTask.update).mockResolvedValue({ ...mockTask, order: 2 } as any);

      await projectService.updateTaskPosition('task-1', { columnId: 'col-1', order: 2 });

      // Moving down: 0 -> 2
      expect(prisma.projectTask.updateMany).toHaveBeenCalledWith({
        where: { columnId: 'col-1', order: { gt: 0, lte: 2 } },
        data: { order: { decrement: 1 } },
      });

      expect(prisma.projectTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { columnId: 'col-1', order: 2 },
      });
    });
  });
});
