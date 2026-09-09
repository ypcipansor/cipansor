"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@/components/shared";
import { MainLayout } from "@/components/layout";
import {
  PageHeader,
  DataTable,
  SearchInput,
  ConfirmDialog,
} from "@/components/shared";
import { useStudents, useDeleteStudent, Student } from "@/hooks/use-students";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import { safeFormat } from "@/lib/date";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { getEffectiveRole } from "@/lib/rbac";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  GRADUATED: "bg-blue-100 text-blue-800",
  DROPPED_OUT: "bg-red-100 text-red-800",
};

const genderLabels: Record<string, string> = {
  MALE: "Laki-laki",
  FEMALE: "Perempuan",
};

export default function StudentsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useStudents({
    page,
    limit: pageSize,
    search: search || undefined,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    unitId: getEffectiveRole(user) !== "SUPER_ADMIN" ? user?.unitId : undefined,
  });

  const deleteMutation = useDeleteStudent();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success("Student deleted successfully");
      setDeleteId(null);
    } catch {
      toast.error("Failed to delete student");
    }
  };

  const columns: ColumnDef<Student>[] = [
    {
      accessorKey: "nisn",
      header: "NISN",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.nisn || row.original.nik || "-"}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {genderLabels[row.original.gender]}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "currentClass",
      header: "Class",
      cell: ({ row }) =>
        row.original.currentClass ? (
          <Badge variant="outline">{row.original.currentClass.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: "unit",
      header: "Unit",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.unit?.name || "-"}</span>
      ),
    },
    {
      accessorKey: "parentName",
      header: "Parent",
      cell: ({ row }) => (
        <div className="text-sm">
          <p>{row.original.parentName}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.parentPhone}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge className={statusColors[row.original.status]}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "enrollmentDate",
      header: "Enrolled",
      cell: ({ row }) => (
        <span className="text-sm">
          {safeFormat(row.original.enrollmentDate, "dd MMM yyyy")}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => router.push(`/students/${row.original.id}`)}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push(`/students/${row.original.id}/edit`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeleteId(row.original.id)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN", "TEACHER"]}>
      <div className="space-y-6">
        <PageHeader
          title="Students"
          description="Manage student records"
          action={{
            label: "Add Student",
            href: "/students/new",
          }}
        />

        {/* Filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="w-full md:w-80">
            <SearchInput
              placeholder="Search by name or NISN..."
              value={search}
              onChange={setSearch}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="GRADUATED">Graduated</SelectItem>
              <SelectItem value="DROPPED_OUT">Dropped Out</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          onRowClick={(row) => router.push(`/students/${row.id}`)}
          pagination={{
            page,
            totalPages: data?.meta?.totalPages || 1,
            pageSize,
            total: data?.meta?.total || 0,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={(open) => !open && setDeleteId(null)}
          title="Delete Student"
          description="Are you sure you want to delete this student? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          isLoading={deleteMutation.isPending}
          variant="destructive"
        />
      </div>
    </MainLayout>
  );
}
