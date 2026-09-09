import { type ColumnDef } from "@/components/shared";
import { safeFormat } from "@/lib/date";
import { DataTable } from "@/components/shared";
import { AssignmentSubmission } from "@cipansor/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface SubmissionListProps {
  submissions: AssignmentSubmission[];
  isLoading: boolean;
  onGrade: (studentId: string, grade: number, feedback?: string) => void;
}

export function SubmissionList({
  submissions,
  isLoading,
  onGrade,
}: SubmissionListProps) {
  const columns: ColumnDef<AssignmentSubmission>[] = [
    {
      accessorKey: "student",
      header: "Student",
      cell: ({ row }) => row.original.student?.name || "Unknown",
    },
    {
      accessorKey: "submittedAt",
      header: "Submitted At",
      cell: ({ row }) =>
        safeFormat(new Date(row.original.submittedAt), "dd MMM yyyy HH:mm"),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge>{row.original.status}</Badge>,
    },
    {
      accessorKey: "content",
      header: "Content",
      cell: ({ row }) => (
        <div
          className="max-w-[200px] truncate"
          title={row.original.content || ""}
        >
          {row.original.content || "-"}
        </div>
      ),
    },
    {
      id: "grading",
      header: "Grade",
      cell: ({ row }) => {
        const [grade, setGrade] = useState(
          row.original.grade?.toString() || "",
        );
        const [isEditing, setIsEditing] = useState(false);

        const handleSave = () => {
          onGrade(row.original.studentId, Number(grade));
          setIsEditing(false);
        };

        if (isEditing) {
          return (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-20"
                min={0}
                max={100}
              />
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
            </div>
          );
        }

        return (
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            {row.original.grade !== undefined && row.original.grade !== null
              ? row.original.grade
              : "Grade"}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable columns={columns} data={submissions} isLoading={isLoading} />
  );
}
