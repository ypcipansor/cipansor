import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { push, store } = vi.hoisted(() => ({
  push: vi.fn(),
  store: { current: {} as Record<string, unknown> },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => store.current }));

import { ProtectedRoute } from "./protected-route";

// SMP IT TU as /auth/me returns them: legacy bucket STAFF, with the API
// permissions of their active role.
function tataUsaha(permissions: string[]) {
  return {
    id: "u-tu",
    role: "STAFF",
    permissions,
    userRoles: [
      {
        id: "a1",
        isPrimary: true,
        role: {
          id: "r1",
          code: "SMPIT_TATA_USAHA",
          name: "TU",
          realm: "SMPIT",
        },
      },
    ],
  };
}

function signIn(user: unknown) {
  store.current = {
    isAuthenticated: true,
    isLoading: false,
    user,
    fetchUser: () => Promise.resolve(),
  };
}

beforeEach(() => push.mockClear());

describe("ProtectedRoute allowedPermissions", () => {
  it("admits a user whose role holds one of the permissions", async () => {
    signIn(tataUsaha(["STUDENT_VIEW", "STUDENT_UPDATE"]));
    render(
      <ProtectedRoute
        allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}
        allowedPermissions={["STUDENT_UPDATE"]}
      >
        <p>form</p>
      </ProtectedRoute>,
    );
    expect(screen.getByText("form")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("still turns away a user with neither the role nor the permission", async () => {
    signIn(tataUsaha(["STUDENT_VIEW"]));
    render(
      <ProtectedRoute
        allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN"]}
        allowedPermissions={["STUDENT_UPDATE"]}
      >
        <p>form</p>
      </ProtectedRoute>,
    );
    expect(screen.queryByText("form")).toBeNull();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/unauthorized"));
  });
});
