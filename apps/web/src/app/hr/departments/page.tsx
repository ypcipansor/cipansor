"use client";

import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  Department,
} from "@/hooks/use-departments";
import { useEmployees } from "@/hooks";
import { Plus, Search, Edit, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const departmentSchema = z.object({
  code: z.string().min(1, "Kode harus diisi"),
  name: z.string().min(1, "Nama departemen harus diisi"),
  description: z.string().optional(),
  managerId: z.string().nullable().optional(),
  isActive: z.boolean(),
});

type DepartmentFormValues = z.infer<typeof departmentSchema>;

export default function DepartmentsPage() {
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: departments, isLoading } = useDepartments({ search });
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();

  const handleOpenDialog = (dept?: Department) => {
    setSelectedDept(dept || null);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success("Department deleted successfully");
      setDeleteId(null);
    } catch (error) {
      toast.error("Failed to delete department");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Departemen</h1>
            <p className="text-muted-foreground">
              Kelola struktur organisasi dan departemen
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Tambah Departemen
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari departemen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama Departemen</TableHead>
                <TableHead>Kepala Departemen</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Jumlah Pegawai</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : departments?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Belum ada data departemen
                  </TableCell>
                </TableRow>
              ) : (
                departments?.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-mono">{dept.code}</TableCell>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell>{dept.manager?.name || "-"}</TableCell>
                    <TableCell>{dept.description || "-"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          dept.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {dept.isActive ? "Aktif" : "Non-Aktif"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {((dept._count as any)?.staff || 0) +
                        ((dept._count as any)?.teachers || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(dept)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(dept.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DepartmentDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          department={selectedDept}
          onSubmit={async (data) => {
            try {
              if (selectedDept) {
                await updateMutation.mutateAsync({
                  id: selectedDept.id,
                  data: {
                    ...data,
                    managerId: data.managerId || undefined,
                  },
                });
                toast.success("Department updated successfully");
              } else {
                await createMutation.mutateAsync({
                  ...data,
                  managerId: data.managerId || undefined,
                });
                toast.success("Department created successfully");
              }
              setIsDialogOpen(false);
            } catch (error) {
              toast.error("Operation failed");
            }
          }}
        />

        <AlertDialog
          open={!!deleteId}
          onOpenChange={(open) => !open && setDeleteId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Departemen?</AlertDialogTitle>
              <AlertDialogDescription>
                Tindakan ini tidak dapat dibatalkan. Departemen akan dihapus
                secara permanen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

function DepartmentDialog({
  open,
  onOpenChange,
  department,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
  onSubmit: (data: DepartmentFormValues) => Promise<void>;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      managerId: null,
      isActive: true,
    },
  });

  const { data: employeesData } = useEmployees({ status: "ACTIVE" });
  const employees = employeesData?.data || [];

  useEffect(() => {
    if (open) {
      if (department) {
        reset({
          code: department.code,
          name: department.name,
          description: department.description || "",
          managerId: department.managerId || null,
          isActive: department.isActive,
        });
      } else {
        reset({
          code: "",
          name: "",
          description: "",
          managerId: null,
          isActive: true,
        });
      }
    }
  }, [open, department, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {department ? "Edit Departemen" : "Tambah Departemen"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Kode Departemen</Label>
            <Input
              id="code"
              {...register("code")}
              placeholder="e.g. IT, HR, FIN"
            />
            {errors.code && (
              <p className="text-sm text-red-500">{errors.code.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nama Departemen</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="e.g. Information Technology"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="managerId">Kepala Departemen</Label>
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(val) =>
                    field.onChange(val === "none" ? null : val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kepala Departemen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Tidak Ada --</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem
                        key={emp.userId || emp.id}
                        value={emp.userId || emp.id}
                      >
                        {emp.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea id="description" {...register("description")} />
          </div>
          <div className="flex items-center space-x-2">
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="isActive"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="isActive">Aktif</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Simpan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
