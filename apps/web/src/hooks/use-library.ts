import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { PaginatedResponse } from "@/lib/api";
import {
  Book,
  BookCategory,
  Borrowing as Borrow,
  BorrowingStatus as BorrowStatus,
  BookStatus,
  CreateBorrowingInput,
  ReturnBookInput,
} from "@cipansor/shared";

// Re-export types for component use
export type { Book, BookCategory, Borrow, BorrowStatus, BookStatus };

// Constants
export const BORROW_STATUSES: {
  value: BorrowStatus;
  label: string;
  color: string;
}[] = [
  {
    value: BorrowStatus.ACTIVE,
    label: "Dipinjam",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: BorrowStatus.RETURNED,
    label: "Dikembalikan",
    color: "bg-green-100 text-green-800",
  },
  {
    value: BorrowStatus.OVERDUE,
    label: "Terlambat",
    color: "bg-red-100 text-red-800",
  },
  {
    value: BorrowStatus.LOST,
    label: "Hilang",
    color: "bg-gray-100 text-gray-800",
  },
];

export const BOOK_CATEGORIES = [
  { value: "FIQH", label: "Fiqih" },
  { value: "AQIDAH", label: "Aqidah" },
  { value: "TASAWUF", label: "Tasawuf" },
  { value: "HADITS", label: "Hadits" },
  { value: "TAFSIR", label: "Tafsir" },
  { value: "TARIKH", label: "Tarikh (Sejarah)" },
  { value: "BAHASA", label: "Bahasa Arab/Nahwu Shorof" },
  { value: "UMUM", label: "Umum/Pelajaran" },
  { value: "LAINNYA", label: "Lainnya" },
];

// Category Hooks
export function useBookCategories(unitId?: string) {
  return useQuery({
    queryKey: ["book-categories", unitId],
    queryFn: async () => {
      const response = await api.get<{ data: BookCategory[] }>(
        "/library/categories",
        { params: { unitId } },
      );
      // The endpoint wraps the array in { success, data }; return the array
      // (returning the envelope made `categories.map` crash the page).
      return response.data.data ?? [];
    },
  });
}

// Books Hooks
export function useBooks(params?: {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  unitId?: string;
  status?: BookStatus;
  isDigital?: boolean;
}) {
  return useQuery({
    queryKey: ["books", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Book>>(
        "/library/books",
        { params },
      );
      return response.data;
    },
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ["books", id],
    queryFn: async () => {
      const response = await api.get<Book>(`/library/books/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post<Book>("/library/books", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await api.put<Book>(`/library/books/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/library/books/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

// Borrow Hooks
export function useBorrows(params?: {
  page?: number;
  limit?: number;
  studentId?: string;
  bookId?: string;
  status?: BorrowStatus;
}) {
  return useQuery({
    queryKey: ["borrows", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Borrow>>(
        "/library/borrowings",
        { params },
      );
      return response.data;
    },
  });
}

export function useBorrow(id: string) {
  return useQuery({
    queryKey: ["borrows", id],
    queryFn: async () => {
      const response = await api.get<Borrow>(`/library/borrowings/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useStudentBorrows(studentId: string) {
  return useQuery({
    queryKey: ["borrows", "student", studentId],
    queryFn: async () => {
      // Assuming endpoint exists or filter by studentId in main list
      const response = await api.get<PaginatedResponse<Borrow>>(
        "/library/borrowings",
        { params: { studentId } },
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

export function useCreateBorrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBorrowingInput) => {
      const response = await api.post<Borrow>("/library/borrowings", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export function useReturnBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReturnBookInput }) => {
      const response = await api.patch<Borrow>(
        `/library/borrowings/${id}/return`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export function useMarkLost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.patch<Borrow>(
        `/library/borrowings/${id}/lost`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

// Library Summary Hook
export function useLibrarySummary(unitId?: string) {
  return useQuery({
    queryKey: ["library", "stats", unitId],
    queryFn: async () => {
      // Note: Endpoint changed to /stats/:unitId
      if (!unitId) return null;
      const response = await api.get<{
        totalTitles: number;
        totalBooks: number;
        availableBooks: number;
        totalCategories: number;
        activeBorrowings: number;
        overdueBorrowings: number;
      }>(`/library/stats/${unitId}`);
      return response.data;
    },
    enabled: !!unitId,
  });
}
