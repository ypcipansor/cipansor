import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as service from '../../../../src/modules/library/library.service';
import { prisma } from '../../../../src/lib/prisma';
import { BookStatus } from '@cipansor/shared';

// Mock Prisma
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    book: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    bookCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    borrowing: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('Library Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBook', () => {
    it('should create a book with correct available quantity', async () => {
      const input = {
        unitId: 'unit-1',
        categoryId: 'cat-1',
        title: 'Test Book',
        author: 'Author',
        quantity: 5,
      };

      const expectedBook = {
        id: 'book-1',
        ...input,
        available: 5,
      };

      vi.mocked(prisma.book.create).mockResolvedValue(expectedBook as any);

      const result = await service.createBook(input as any);

      expect(prisma.book.create).toHaveBeenCalledWith({
        data: {
          title: 'Test Book',
          author: 'Author',
          quantity: 5,
          available: 5, // Should match quantity
          unitId: 'unit-1',
          categoryId: 'cat-1',
        },
        include: expect.any(Object),
      });
      expect(result).toEqual(expectedBook);
    });
  });

  describe('updateBook', () => {
    it('should update available quantity when total quantity changes', async () => {
      const existingBook = {
        id: 'book-1',
        quantity: 5,
        available: 2, // 3 borrowed
      };

      vi.mocked(prisma.book.findUnique).mockResolvedValue(existingBook as any);
      vi.mocked(prisma.book.update).mockResolvedValue({
        ...existingBook,
        quantity: 10,
        available: 7,
      } as any);

      await service.updateBook('book-1', { quantity: 10 });

      expect(prisma.book.update).toHaveBeenCalledWith({
        where: { id: 'book-1' },
        data: {
          quantity: 10,
          available: 7, // 10 - 3 (borrowed) = 7
        },
        include: expect.any(Object),
      });
    });
  });

  describe('createBorrowing', () => {
    it('should fail if book is not available', async () => {
      vi.mocked(prisma.book.findUnique).mockResolvedValue({ available: 0 } as any);

      await expect(
        service.createBorrowing(
          {
            bookId: 'book-1',
            borrowerId: 'student-1',
            borrowerType: 'STUDENT',
            dueDate: new Date(),
          },
          'staff-1'
        )
      ).rejects.toThrow('Book not available');
    });

    it('should create borrowing and decrement book availability', async () => {
      vi.mocked(prisma.book.findUnique).mockResolvedValue({ id: 'book-1', available: 5 } as any);
      vi.mocked(prisma.borrowing.create).mockResolvedValue({ id: 'bor-1' } as any);

      // Mock transaction execution
      vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
        (cb as unknown as (tx: typeof prisma) => unknown)(prisma)
      );

      await service.createBorrowing(
        {
          bookId: 'book-1',
          borrowerId: 'student-1',
          borrowerType: 'STUDENT',
          dueDate: new Date(),
        },
        'staff-1'
      );

      expect(prisma.borrowing.create).toHaveBeenCalled();
      expect(prisma.book.update).toHaveBeenCalledWith({
        where: { id: 'book-1' },
        data: {
          available: { decrement: 1 },
          status: BookStatus.AVAILABLE, // 5 available → still AVAILABLE after one borrow
        },
      });
    });
  });
});
