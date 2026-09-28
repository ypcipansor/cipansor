import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  ApiResponse,
  CreateAccreditationInput,
  UnitAccreditation,
  UnitAccreditationList,
  UpdateAccreditationInput,
} from "@cipansor/shared";

/**
 * A unit's accreditation certificates (decisions/akreditasi-unit.md): read by
 * the unit's admin and kepala sekolah and the yayasan's organs, kept by the
 * unit's admin and the Super Admin.
 */

const key = (unitId: string) => ["units", unitId, "accreditations"] as const;

/** The instance defaults to JSON, which would flatten the form. */
const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export function useUnitAccreditations(unitId: string) {
  return useQuery({
    queryKey: key(unitId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<UnitAccreditationList>>(
        `/units/${unitId}/accreditations`,
      );
      return response.data.data!;
    },
    enabled: !!unitId,
  });
}

/** The fields as multipart form data, with the PDF when there is one. */
function formOf(
  fields: Partial<CreateAccreditationInput>,
  certificate?: File | null,
) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") form.append(name, String(value));
  }
  if (certificate) form.append("certificate", certificate);
  return form;
}

export function useRecordAccreditation(unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      data,
      certificate,
    }: {
      data: CreateAccreditationInput;
      certificate: File;
    }) => {
      const response = await api.post<ApiResponse<UnitAccreditation>>(
        `/units/${unitId}/accreditations`,
        formOf(data, certificate),
        MULTIPART,
      );
      return response.data.data!;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(unitId) }),
  });
}

export function useCorrectAccreditation(unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      certificate,
    }: {
      id: string;
      data: UpdateAccreditationInput;
      certificate?: File | null;
    }) => {
      const response = await api.patch<ApiResponse<UnitAccreditation>>(
        `/units/${unitId}/accreditations/${id}`,
        formOf(data, certificate),
        MULTIPART,
      );
      return response.data.data!;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(unitId) }),
  });
}

export function useDeleteAccreditation(unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/units/${unitId}/accreditations/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(unitId) }),
  });
}

/** Fetch the certificate PDF with the session and hand it to the browser. */
export async function downloadAccreditationCertificate(
  unitId: string,
  accreditation: Pick<UnitAccreditation, "id" | "certificateNumber">,
) {
  const response = await api.get<Blob>(
    `/units/${unitId}/accreditations/${accreditation.id}/certificate`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sertifikat-akreditasi-${accreditation.certificateNumber.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
