import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  StudentOrg,
  StudentOrgMember,
  StudentOrgLogbook,
} from "@cipansor/shared";

export function useStudentOrgs(params?: {
  unitId?: string;
  academicYearId?: string;
}) {
  return useQuery({
    queryKey: ["student-orgs", params],
    queryFn: async () => {
      const { data } = await api.get("/student-org", { params });
      return data.data as (StudentOrg & { positions: any[] })[];
    },
  });
}

export function useOrgMember(id: string) {
  return useQuery({
    queryKey: ["org-member", id],
    queryFn: async () => {
      const { data } = await api.get(`/student-org/members/${id}`);
      return data.data as StudentOrgMember & {
        student: { user: { name: string } };
        position: { name: string; org: { name: string } };
        logbooks: StudentOrgLogbook[];
      };
    },
    enabled: !!id,
  });
}

export function useCreateLogbook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      memberId: string;
      date: string;
      activity: string;
      result?: string;
      notes?: string;
    }) => {
      const { data } = await api.post("/student-org/logbooks", payload);
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["org-member", variables.memberId],
      });
    },
  });
}
