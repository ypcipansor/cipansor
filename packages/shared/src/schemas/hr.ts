import { z } from "zod";
import { uploadedFileRefSchema } from "./upload";

/**
 * Request contract for `GET /hr/employees` — the flat employee directory.
 *
 * Lives here (not in the API module) so the web client and the API parse the
 * same query the same way; the repo requires user-facing request contracts to
 * be shared rather than redeclared per app.
 *
 * `status` is only ACTIVE/INACTIVE: the web models a wider lifecycle, but the
 * database only distinguishes those two. A caller asking for RESIGNED would be
 * answered with a filtered-empty lie, so it is rejected instead.
 */
export const hrEmployeeRoleSchema = z.enum(["TEACHER", "STAFF"]);

export const queryEmployeesSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
  role: hrEmployeeRoleSchema.optional(),
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["ACTIVE", "INACTIVE"]).optional(),
  ),
  search: z.string().optional(),
});

export type QueryEmployeesInput = z.infer<typeof queryEmployeesSchema>;

/**
 * Request contract for `POST /hr/documents` — the employee-document upload
 * record. Shared so the web form and the API validate the same fields.
 *
 * `type` uses the Prisma `EmployeeDocumentType` enum on the server; here it is
 * a plain string enum kept in exact sync, because this package cannot import
 * `@prisma/client`. `expiryDate` is coerced from the ISO string the client
 * sends.
 */
export const createEmployeeDocumentSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum([
    "KTP",
    "KK",
    "NPWP",
    "IJAZAH",
    "TRANSKRIP_NILAI",
    "SERTIFIKAT",
    "SK_PENGANGKATAN",
    "KONTRAK_KERJA",
    "CV",
    "LAINNYA",
  ]),
  fileUrl: uploadedFileRefSchema,
  expiryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});
