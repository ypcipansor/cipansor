import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api", () => {
  const api = { post, get };
  return { api, default: api };
});

import { useOnboardRegistrant } from "./use-admissions";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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

    await result.current.mutateAsync({ registrantId: "reg-1", unitId: "unit-1" } as any);

    expect(post).toHaveBeenCalledWith(
      "/admissions/waves/onboard-registrant",
      { registrantId: "reg-1", unitId: "unit-1" },
    );

    // The detail query feeds the onboarding button's enabled/disabled state.
    // Without invalidating it, the button stays visible after onboarding and a
    // second click fails with an "already enrolled" conflict.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admission-registrants"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admission-registrant", "reg-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["students"] });
  });
});
