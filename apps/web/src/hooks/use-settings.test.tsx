import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => {
  const api = { get };
  return { api, default: api };
});

import { useSettings } from "./use-settings";

describe("useSettings", () => {
  it("is the yayasan's real identity, not an invented one", async () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const s = result.current.data!;
    expect(s.institutionName).toBe("Yayasan Pesantren Cipansor");
    expect(s.institutionAddress).toContain("Kabupaten Tasikmalaya");
    expect(s.institutionEmail).toBe("halo@cipansor.or.id");
    expect(JSON.stringify(s)).not.toMatch(
      /Al-Hidayah|Pendidikan No\. 123|1234567/,
    );
    // No request to a route that does not exist (it raised an error toast).
    expect(get).not.toHaveBeenCalled();
  });
});
