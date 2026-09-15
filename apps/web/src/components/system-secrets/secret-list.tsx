"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { safeFormat } from "@/lib/date";
import { api } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2 } from "lucide-react";
import { useState } from "react";
import { SecretForm } from "./secret-form";
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
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface Secret {
  id: string;
  key: string;
  maskedValue: string;
  description?: string;
  updatedAt: string;
}

export function SecretList() {
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [deletingSecret, setDeletingSecret] = useState<Secret | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["secrets"],
    queryFn: async () => {
      const response = await api.get<{ data: Secret[] }>("/secrets");
      return response.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/secrets/${id}`);
    },
    onSuccess: () => {
      toast.success("Secret deleted");
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      setDeletingSecret(null);
    },
    onError: (error) => {
      toast.error("Failed to delete secret");
      console.error(error);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="text-destructive">Failed to load secrets.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingSecret(null);
            setIsFormOpen(true);
          }}
        >
          Add Secret
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No secrets found.
                </TableCell>
              </TableRow>
            ) : (
              data?.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell className="font-medium font-mono">
                    {secret.key}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {secret.maskedValue}
                  </TableCell>
                  <TableCell>{secret.description || "-"}</TableCell>
                  <TableCell>
                    {safeFormat(new Date(secret.updatedAt), "PPP")}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingSecret(secret);
                        setIsFormOpen(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setDeletingSecret(secret)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SecretForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        secret={editingSecret}
      />

      <AlertDialog
        open={!!deletingSecret}
        onOpenChange={(open) => !open && setDeletingSecret(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              secret
              <span className="font-mono font-bold">
                {" "}
                {deletingSecret?.key}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deletingSecret && deleteMutation.mutate(deletingSecret.id)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
