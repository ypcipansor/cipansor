import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublicIntakeDTO } from "@cipansor/shared";

const { intakes } = vi.hoisted(() => ({
  intakes: { current: [] as PublicIntakeDTO[] },
}));
vi.mock("@/hooks/use-admissions", () => ({
  usePublicIntakes: () => ({ data: intakes.current }),
}));

import { SpmbStatusBadge } from "./spmb-status-badge";

/**
 * The homepage badge says what the SPMB page says: open only while some unit
 * takes registrations, else the day the next one opens, else nothing.
 */
function intake(
  window: PublicIntakeDTO["period"]["window"],
  opensAt: string | null = null,
): PublicIntakeDTO {
  return {
    unit: { id: "u", name: "SMP IT", officialName: null, type: "SMP_IT" },
    period: {
      id: "p",
      name: "SPMB 2027/2028 SMP IT",
      academicYear: "2027/2028",
      startDate: "2026-09-30T17:00:00.000Z",
      endDate: "2027-07-10T16:59:59.999Z",
      window,
      opensAt,
      closesAt: null,
      registrationFee: "0",
      requirements: [],
      minAgeMonths: null,
      ageReferenceDate: null,
      contactName: null,
      contactPhone: null,
    },
    waves: [],
    fees: [],
  };
}

describe("the homepage SPMB badge", () => {
  it("announces the intake while a unit takes registrations", () => {
    intakes.current = [intake("closed"), intake("open")];
    render(<SpmbStatusBadge locale="id" />);
    expect(screen.getByTestId("spmb-status-badge").textContent).toBe(
      "SPMB 2027/2028 dibuka",
    );
  });

  it("between two waves, gives the day registration opens again", () => {
    intakes.current = [intake("upcoming", "2026-12-31T17:00:00.000Z")];
    render(<SpmbStatusBadge locale="en" />);
    expect(screen.getByTestId("spmb-status-badge").textContent).toBe(
      "SPMB 2027/2028 opens 1 January 2027",
    );
  });

  it("says nothing once every intake has closed", () => {
    intakes.current = [intake("closed")];
    render(<SpmbStatusBadge locale="ar" />);
    expect(screen.queryByTestId("spmb-status-badge")).toBeNull();
  });
});
