import { z } from "zod";

/**
 * The official-identity fields of PATCH /units/:id, shared by the API's
 * validation and the Edit Unit form. Each may be cleared with `null`.
 */
export const unitOfficialIdentityFields = {
  officialName: z
    .string()
    .trim()
    .min(3, "Nama resmi minimal 3 karakter")
    .max(150, "Nama resmi maksimal 150 karakter"),
  operatingPermitNumber: z
    .string()
    .trim()
    .min(3, "Nomor izin minimal 3 karakter")
    .max(100, "Nomor izin maksimal 100 karakter"),
  operatingPermitDate: z.iso.date({ message: "Tanggal tidak valid" }),
};
