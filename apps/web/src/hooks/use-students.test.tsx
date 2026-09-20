import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api", () => {
  const api = { post, get };
  return { api, default: api };
});

import { useGraduateStudent, useStudent } from "./use-students";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { data: { id: "a1", graduationYear: 2026 } } });
});

describe("useGraduateStudent", () => {
  it("memanggil rute kelulusan yang ADA di API, bukan /students/:id/graduate", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useGraduateStudent(), { wrapper: wrapper(client) });

    const alumni = await result.current.mutateAsync({
      studentId: "s1",
      graduationDate: "2026-06-20T12:00:00.000Z",
      lastClass: "6A",
    });

    // Pasangannya di API: apps/api/src/modules/alumni/graduate.test.ts
    // memaku `router.post('/from-student/:studentId', manageAlumni, …)`.
    expect(post).toHaveBeenCalledWith("/alumni/from-student/s1", {
      graduationDate: "2026-06-20T12:00:00.000Z",
      lastClass: "6A",
    });
    expect(alumni).toEqual({ id: "a1", graduationYear: 2026 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["students", "s1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["alumni"] });
  });
});

describe("useStudent", () => {
  it("nama tampilan diambil dari user.name seperti daftar santri", async () => {
    get.mockResolvedValue({
      data: { data: { id: "s1", nis: "20240001", user: { name: "Muhammad Rizky" } } },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStudent("s1"), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/students/s1");
    expect(result.current.data?.name).toBe("Muhammad Rizky");
  });
});
