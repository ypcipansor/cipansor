import { useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import { type ColumnDef } from "@/components/shared";
import { DataTable } from "@/components/shared";
import { Assignment } from "@cipansor/shared";
import { Badge } from "@/components/ui/badge";

interface AssignmentListProps {
  assignments: Assignment[];
  isLoading: boolean;
  pagination: any;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function AssignmentList({
  assignments,
  isLoading,
  pagination,
  onPageChange,
  onPageSizeChange,
}: AssignmentListProps) {
  const router = useRouter();

  const columns: ColumnDef<Assignment>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.title}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
            {row.original.description}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.subject?.name || "-"}</span>
      ),
    },
    {
      accessorKey: "class",
      header: "Class",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.class?.name || "-"}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-sm">
          {safeFormat(new Date(row.original.dueDate), "dd MMM yyyy HH:mm")}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={assignments}
      isLoading={isLoading}
      onRowClick={(row) => router.push(`/assignments/${row.id}`)}
      pagination={{
        page: pagination.page,
        totalPages: pagination.totalPages,
        pageSize: pagination.limit,
        total: pagination.total,
        onPageChange,
        onPageSizeChange,
      }}
    />
  );
}
