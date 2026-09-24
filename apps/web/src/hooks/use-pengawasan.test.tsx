import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { pengawasanAccessOf } from "@cipansor/shared";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => {
  const api = { get, post: vi.fn(), patch: vi.fn() };
  return { api, default: api };
});

import {
  useWbsReports,
  useBoardSuspensions,
  useFinancialArrears,
} from "./use-pengawasan";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
  get.mockResolvedValue({ data: { data: [] } });
});

/**
 * A role that can open the governance page for its audit access but holds none
 * of the WBS, suspension or arrears grants. Before `enabled` existed the page
 * called all three hooks unconditionally, so this account fired three requests
 * the API answered with 403 and got three error toasts for panels it cannot see.
 */
const AUDIT_ONLY_ROLE = "SDIT_GURU";

describe("pengawasan register hooks are gated on the tab permission", () => {
  it("SDIT_GURU has audit access but no WBS/suspension/arrears grant", () => {
    const access = pengawasanAccessOf(AUDIT_ONLY_ROLE);
    expect(access.canReadAudits).toBe(true);
    expect(access.canHandleWbs).toBe(false);
    expect(access.canReadSuspensions).toBe(false);
    expect(access.canViewArrears).toBe(false);
  });

  it("an audit-only account fires none of the three register requests", async () => {
    const client = makeClient();
    const access = pengawasanAccessOf(AUDIT_ONLY_ROLE);

    renderHook(
      () => ({
        wbs: useWbsReports(access.canHandleWbs),
        suspensions: useBoardSuspensions(access.canReadSuspensions),
        arrears: useFinancialArrears(undefined, access.canViewArrears),
      }),
      { wrapper: wrapper(client) },
    );

    // Give React Query a tick to run (or, correctly, not run) the queries.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(get).not.toHaveBeenCalledWith("/pengawasan/wbs/reports");
    expect(get).not.toHaveBeenCalledWith("/pengawasan/board-suspensions");
    expect(get).not.toHaveBeenCalledWith("/pengawasan/financial-arrears", {
      params: { unitId: undefined },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("a WBS handler still fires the WBS request", async () => {
    const client = makeClient();
    const access = pengawasanAccessOf("YAYASAN_PENGAWAS");
    expect(access.canHandleWbs).toBe(true);

    renderHook(() => useWbsReports(access.canHandleWbs), {
      wrapper: wrapper(client),
    });

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/pengawasan/wbs/reports"),
    );
  });

  it("a register reader still fires the suspension request", async () => {
    const client = makeClient();
    const access = pengawasanAccessOf("YAYASAN_PEMBINA");
    expect(access.canReadSuspensions).toBe(true);

    renderHook(() => useBoardSuspensions(access.canReadSuspensions), {
      wrapper: wrapper(client),
    });

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/pengawasan/board-suspensions"),
    );
  });

  it("an arrears reader still fires the arrears request", async () => {
    const client = makeClient();
    const access = pengawasanAccessOf("YAYASAN_BENDAHARA");
    expect(access.canViewArrears).toBe(true);

    renderHook(() => useFinancialArrears(undefined, access.canViewArrears), {
      wrapper: wrapper(client),
    });

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/pengawasan/financial-arrears", {
        params: { unitId: undefined },
      }),
    );
  });

  it("the default remains enabled so a direct caller is unaffected", async () => {
    const client = makeClient();

    renderHook(() => useWbsReports(), { wrapper: wrapper(client) });

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/pengawasan/wbs/reports"),
    );
  });
});
