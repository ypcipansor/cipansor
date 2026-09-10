import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma Client constructor BEFORE importing anything else
vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      book = {
        findUnique: vi.fn(),
        update: vi.fn(),
      };
      borrowing = {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      };
      $transaction = vi.fn((callback) => callback(this));
    },
    BookStatus: {
      AVAILABLE: 'AVAILABLE',
      BORROWED: 'BORROWED',
    },
    BorrowingStatus: {
      ACTIVE: 'ACTIVE',
    },
  };
});

// Now import the service which imports prisma
import { createBorrowing, getBorrowings } from '../../../../src/modules/library/library.service';
// Import the singleton to spy on methods (it will use the mocked class above)
import { prisma } from '../../../../src/lib/prisma';

describe('Library Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBorrowing', () => {
    it('should create a borrowing record with student relation', async () => {
      const input = {
        bookId: 'book-1',
        studentId: 'student-1',
        borrowerType: 'STUDENT' as const,
        dueDate: new Date(),
        notes: 'Test borrow',
      };

      const mockBook = { id: 'book-1', available: 5, quantity: 10 };
      const mockCreatedBorrowing = {
        id: 'borrow-1',
        ...input,
        status: 'ACTIVE',
      };

      // We need to cast to any because Typescript doesn't know about the mock methods on the singleton instance type
      (prisma.book.findUnique as any).mockResolvedValue(mockBook);
      (prisma.borrowing.create as any).mockResolvedValue(mockCreatedBorrowing);

      const result = await createBorrowing(input, 'admin-1');

      expect(prisma.book.findUnique).toHaveBeenCalledWith({ where: { id: 'book-1' } });
      expect(prisma.borrowing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            borrowerId: 'student-1', // Should auto-fill
          }),
          include: expect.objectContaining({
            student: expect.any(Object),
          }),
        })
      );
      expect(result).toEqual(mockCreatedBorrowing);
    });

    it('should throw error if book is not available', async () => {
      const input = {
        bookId: 'book-1',
        studentId: 'student-1',
        borrowerType: 'STUDENT' as const,
        dueDate: new Date(),
      };

      (prisma.book.findUnique as any).mockResolvedValue({ id: 'book-1', available: 0 });

      await expect(createBorrowing(input, 'admin-1')).rejects.toThrow('Book not available');
    });
  });

  describe('getBorrowings', () => {
    it('should return borrowings with student details', async () => {
      const mockBorrowings = [
        {
          id: 'borrow-1',
          book: { title: 'Book 1' },
          student: { name: 'Student 1', nisn: '123' },
        },
      ];

      (prisma.borrowing.findMany as any).mockResolvedValue(mockBorrowings);
      (prisma.borrowing.count as any).mockResolvedValue(1);

      const result = await getBorrowings({ page: 1, limit: 10 });

      expect(prisma.borrowing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            student: expect.objectContaining({
              select: expect.objectContaining({
                user: expect.objectContaining({ select: { name: true } }),
              }),
            }),
          }),
        })
      );
      expect(result.data).toEqual(mockBorrowings);
      expect(result.meta.total).toBe(1);
    });
  });
});
