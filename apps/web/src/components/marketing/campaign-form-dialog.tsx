"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { MarketingCampaign, CreateCampaignInput } from "@cipansor/shared";
import { useCreateCampaign, useUpdateCampaign } from "@/hooks/use-marketing";
import { useEffect } from "react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  code: z.string().min(1, "Kode wajib diisi"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  endDate: z.string().optional(),
  budget: z.coerce.number().optional(),
});

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: MarketingCampaign | null;
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
}: CampaignFormDialogProps) {
  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      budget: 0,
    },
  });

  useEffect(() => {
    if (campaign) {
      form.reset({
        name: campaign.name,
        code: campaign.code,
        description: campaign.description || "",
        startDate: new Date(campaign.startDate).toISOString().split("T")[0],
        endDate: campaign.endDate
          ? new Date(campaign.endDate).toISOString().split("T")[0]
          : "",
        budget: Number(campaign.budget) || 0,
      });
    } else {
      form.reset({
        name: "",
        code: "",
        description: "",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        budget: 0,
      });
    }
  }, [campaign, form]);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      const payload: CreateCampaignInput = {
        ...values,
        startDate: new Date(values.startDate).toISOString(),
        endDate: values.endDate
          ? new Date(values.endDate).toISOString()
          : undefined,
      };

      if (campaign) {
        await updateMutation.mutateAsync({ id: campaign.id, data: payload });
        toast.success("Kampanye berhasil diperbarui");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Kampanye berhasil dibuat");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error("Gagal menyimpan kampanye");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {campaign ? "Edit Kampanye" : "Buat Kampanye Baru"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Kampanye</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Contoh: Ramadhan Special" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kode (Slug)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ramadhan-2024" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget (Rp)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tanggal Mulai</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tanggal Selesai</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Simpan
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
