import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api", () => {
  const api = { post, get };
  return { api, default: api };
});

import {
  useInternalCandidates,
  useOnboardRegistrant,
  usePublicIntakes,
} from "./use-admissions";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { success: true } });
});

describe("useOnboardRegistrant", () => {
  it("invalidates the registrant detail, the list, and students on success", async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useOnboardRegistrant(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync({
      registrantId: "reg-1",
      unitId: "unit-1",
    } as any);

    expect(post).toHaveBeenCalledWith("/admissions/waves/onboard-registrant", {
      registrantId: "reg-1",
      unitId: "unit-1",
    });

    // The detail query feeds the onboarding button's enabled/disabled state.
    // Without invalidating it, the button stays visible after onboarding and a
    // second click fails with an "already enrolled" conflict.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["admission-registrants"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["admission-registrant", "reg-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["students"] });
  });
});

describe("useInternalCandidates", () => {
  it("menanyakan kandidat santri lama ke rute yang dijaga sama dengan onboarding", async () => {
    // Pasangannya di API: apps/api/src/modules/admissions/internal-candidates.test.ts
    get.mockResolvedValue({
      data: {
        data: [
          { studentId: "stud-1", nama: "Fulan", unitAsal: "SD IT Cipansor" },
        ],
      },
    });
    const client = makeClient();
    const { result } = renderHook(() => useInternalCandidates("reg-1"), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(
      "/admissions/waves/internal-candidates/reg-1",
    );
    expect(result.current.data?.[0]?.studentId).toBe("stud-1");
  });

  it("tidak dipanggil untuk pendaftar yang belum diterima", async () => {
    const client = makeClient();
    renderHook(() => useInternalCandidates("reg-1", false), {
      wrapper: wrapper(client),
    });

    expect(get).not.toHaveBeenCalled();
  });
});

describe("useOnboardRegistrant — progresi internal", () => {
  it("meneruskan existingStudentId supaya orkestrator memakai santri yang sudah ada", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useOnboardRegistrant(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync({
      registrantId: "reg-1",
      unitId: "unit-smp",
      existingStudentId: "stud-1",
    });

    expect(post).toHaveBeenCalledWith("/admissions/waves/onboard-registrant", {
      registrantId: "reg-1",
      unitId: "unit-smp",
      existingStudentId: "stud-1",
    });
  });
});

describe("usePublicIntakes — freshness", () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: { data: [] } });
  });

  it("keeps the shared cache key whatever freshness options are passed", async () => {
    // The SPMB announcement and the SPMB page/form must read the same cache
    // entry, or an announcement could disagree with the page beside it. Only
    // the query *options* differ per surface, never the key.
    const client = makeClient();
    const { result } = renderHook(
      () =>
        usePublicIntakes({
          staleTime: 15 * 60 * 1000,
          refetchInterval: 15 * 60 * 1000,
          refetchOnWindowFocus: true,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/admissions/public/intakes");
    const [entry] = client.getQueryCache().getAll();
    expect(entry.queryKey).toEqual(["admissions", "public", "intakes"]);
    const options = entry.options as {
      staleTime?: number;
      refetchInterval?: number;
      refetchOnWindowFocus?: boolean;
    };
    expect(options.refetchInterval).toBe(15 * 60 * 1000);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("leaves refetchInterval unset by default, as before", async () => {
    const client = makeClient();
    const { result } = renderHook(() => usePublicIntakes(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [entry] = client.getQueryCache().getAll();
    const options = entry.options as {
      staleTime?: number;
      refetchInterval?: number;
    };
    expect(options.refetchInterval).toBeUndefined();
    expect(options.staleTime).toBe(5 * 60 * 1000);
  });
});
