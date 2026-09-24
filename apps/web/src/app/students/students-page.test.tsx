import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { layoutProps, useStudents, granted } = vi.hoisted(() => ({
  layoutProps: { current: {} as Record<string, unknown> },
  useStudents: vi.fn(),
  granted: { current: new Set<string>() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({
  MainLayout: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => {
    layoutProps.current = props;
    return <div>{children}</div>;
  },
}));
vi.mock("@/hooks/use-permission", () => ({
  usePermission: (p: string) => granted.current.has(p),
}));
vi.mock("@/hooks/use-students", () => ({
  useStudents,
  useDeleteStudent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import StudentsPage from "./page";

beforeEach(() => {
  // What useStudents returns once it has flattened GET /students' envelope.
  useStudents.mockReturnValue({
    isLoading: false,
    data: {
      data: [
        {
          id: "s1",
          nis: "20240001",
          name: "Muhammad Rizky",
          gender: "MALE",
          status: "active",
        },
      ],
      meta: { page: 1, limit: 10, total: 601, totalPages: 61 },
    },
  });
});

describe("student roster", () => {
  it("opens for STAFF, where TU sits, as rbac.ts and the sidebar already do", () => {
    granted.current = new Set(["STUDENT_VIEW"]);
    render(<StudentsPage />);
    expect(layoutProps.current.allowedRoles).toContain("STAFF");
  });

  it("shows the real total instead of 0 of 0", () => {
    granted.current = new Set(["STUDENT_VIEW"]);
    render(<StudentsPage />);
    expect(screen.getByText(/of 601 results/)).toBeDefined();
  });

  it("asks the API without pinning the user's home unit", () => {
    granted.current = new Set(["STUDENT_VIEW"]);
    render(<StudentsPage />);
    expect(useStudents.mock.calls[0][0]).not.toHaveProperty("unitId");
  });

  it("offers Add Student only to a role that may create one", () => {
    granted.current = new Set(["STUDENT_VIEW"]);
    const { unmount } = render(<StudentsPage />);
    expect(screen.queryByText("Add Student")).toBeNull();
    unmount();

    granted.current = new Set(["STUDENT_VIEW", "STUDENT_CREATE"]);
    render(<StudentsPage />);
    expect(screen.getByText("Add Student")).toBeDefined();
  });
});
