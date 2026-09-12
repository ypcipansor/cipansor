import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SPMBPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/layout/main-layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-admissions", () => ({
  useRegistrants: (params?: any) => {
    if (params?.status === "ACCEPTED") {
      return { data: { meta: { total: 15 }, data: [] } };
    }
    if (params?.status === "DOCUMENT_CHECK") {
      return { data: { meta: { total: 5 }, data: [] } };
    }
    return { data: { meta: { total: 25 }, data: [] } };
  },
  useAdmissionPeriods: () => ({
    data: { meta: { total: 3 }, data: [] },
  }),
  useActiveAdmissionWaves: () => ({
    data: { pagination: { total: 2 }, data: [{ id: "w1" }, { id: "w2" }] },
  }),
}));

describe("SPMBPage Dashboard", () => {
  it("renders correct counts for stats cards including active open waves", () => {
    render(<SPMBPage />);

    expect(screen.getByText("Total Pendaftar")).toBeDefined();
    expect(screen.getAllByText("25").length).toBeGreaterThan(0);

    expect(screen.getByText("Lulus Seleksi")).toBeDefined();
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);

    expect(screen.getByText("Gelombang Aktif")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("Gelombang berstatus OPEN")).toBeDefined();
  });
});
