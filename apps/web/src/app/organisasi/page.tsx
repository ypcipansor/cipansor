"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useOrgUnits,
  useOrgTree,
  useCreateOrgUnit,
  useDeleteOrgUnit,
  useCreatePosition,
  useDeletePosition,
} from "@/hooks/use-organisasi";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Building2, Users, GitBranch } from "lucide-react";

const unitFormSchema = z.object({
  unitId: z.string().min(1, "Unit wajib"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  code: z.string().min(2, "Kode minimal 2 karakter"),
  description: z.string().optional(),
  parentId: z.string().optional(),
  level: z.string().optional(),
});

const positionFormSchema = z.object({
  orgUnitId: z.string().min(1, "Unit organisasi wajib"),
  title: z.string().min(2, "Jabatan wajib"),
  code: z.string().optional(),
  description: z.string().optional(),
});

function OrgUnitFormDialog({ onClose }: { onClose: () => void }) {
  const createUnit = useCreateOrgUnit();
  const form = useForm<z.infer<typeof unitFormSchema>>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: {
      unitId: "",
      name: "",
      code: "",
      description: "",
      parentId: "",
      level: "0",
    },
  });

  const onSubmit = async (values: z.infer<typeof unitFormSchema>) => {
    await createUnit.mutateAsync({
      ...values,
      level: Number(values.level || 0),
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Tambah Unit Organisasi</DialogTitle>
        <DialogDescription>
          Buat unit baru dalam struktur organisasi.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="unitId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit ID</FormLabel>
                <FormControl>
                  <Input placeholder="UUID unit sekolah" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama</FormLabel>
                  <FormControl>
                    <Input placeholder="cth: Divisi Akademik" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode</FormLabel>
                  <FormControl>
                    <Input placeholder="cth: AKD" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deskripsi</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={createUnit.isPending}>
              {createUnit.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

function PositionFormDialog({
  orgUnits,
  onClose,
}: {
  orgUnits?: any[];
  onClose: () => void;
}) {
  const createPosition = useCreatePosition();
  const form = useForm<z.infer<typeof positionFormSchema>>({
    resolver: zodResolver(positionFormSchema),
    defaultValues: { orgUnitId: "", title: "", code: "", description: "" },
  });

  const onSubmit = async (values: z.infer<typeof positionFormSchema>) => {
    await createPosition.mutateAsync(values);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Tambah Jabatan</DialogTitle>
        <DialogDescription>
          Buat jabatan baru dalam unit organisasi.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="orgUnitId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Organisasi ID</FormLabel>
                <FormControl>
                  <Input placeholder="UUID org unit" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jabatan</FormLabel>
                <FormControl>
                  <Input placeholder="cth: Kepala Divisi" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={createPosition.isPending}>
              {createPosition.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

function OrgTreeNode({ node, depth = 0 }: { node: any; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <Card className="mb-2 hover:shadow-md transition-shadow">
        <CardHeader className="py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {depth > 0 && (
                <GitBranch className="h-3 w-3 text-muted-foreground" />
              )}
              <CardTitle className="text-sm">{node.name}</CardTitle>
              <Badge variant="outline" className="text-xs">
                {node.code}
              </Badge>
            </div>
            <Badge className="bg-blue-100 text-blue-700 text-xs">
              Lvl {node.level}
            </Badge>
          </div>
          {node.positions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.positions.map((p: any) => (
                <Badge key={p.id} variant="secondary" className="text-xs">
                  {p.title} {p.holder ? `— ${p.holder.name}` : "(kosong)"}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>
      {node.children?.map((child: any) => (
        <OrgTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function OrganisasiPageContent() {
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);

  const { data: orgTree, isLoading } = useOrgTree();
  const { data: orgUnits } = useOrgUnits();
  const totalPositions =
    orgUnits?.reduce(
      (s: number, u: any) => s + (u.positions?.length || 0),
      0,
    ) || 0;

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Struktur Organisasi"
        description="Kelola unit dan jabatan dalam struktur organisasi."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Unit Organisasi
            </CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                orgUnits?.length || 0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Total Jabatan
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {totalPositions}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> Kedalaman
            </CardDescription>
            <CardTitle className="text-3xl text-purple-600">
              {orgTree ? Math.max(...(orgTree as any[]).map(() => 1), 0) : 0}{" "}
              level
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Dialog open={positionDialogOpen} onOpenChange={setPositionDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-1">
              <Users className="h-4 w-4" /> Tambah Jabatan
            </Button>
          </DialogTrigger>
          <PositionFormDialog
            orgUnits={orgUnits}
            onClose={() => setPositionDialogOpen(false)}
          />
        </Dialog>
        <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1">
              <Plus className="h-4 w-4" /> Tambah Unit
            </Button>
          </DialogTrigger>
          <OrgUnitFormDialog onClose={() => setUnitDialogOpen(false)} />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : orgTree?.length === 0 || !orgTree ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p>
              Belum ada unit organisasi. Mulai dengan menambahkan unit root.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orgTree.map((root: any) => (
            <OrgTreeNode key={root.id} node={root} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrganisasiPageWithShell() {
  return (
    <MainLayout>
      <OrganisasiPageContent />
    </MainLayout>
  );
}
