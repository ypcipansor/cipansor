"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  BOARD_MEMBER_POSITIONS,
  boardMemberFields,
  type BoardMember,
} from "@cipansor/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const optional = <T extends z.ZodTypeAny>(field: T) => field.or(z.literal(""));

const formSchema = z.object({
  name: boardMemberFields.name,
  position: boardMemberFields.position,
  phone: optional(boardMemberFields.phone),
  email: optional(boardMemberFields.email),
  startDate: optional(boardMemberFields.startDate),
  endDate: optional(boardMemberFields.endDate),
  isActive: z.boolean(),
});

export type BoardMemberFormValues = z.infer<typeof formSchema>;

/** What the API takes: empty text is "not given", an empty date is "unknown". */
export function boardMemberPayload(values: BoardMemberFormValues) {
  return {
    name: values.name,
    position: values.position,
    phone: values.phone || null,
    email: values.email || null,
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    isActive: values.isActive,
  };
}

const toDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function boardMemberFormValues(
  member?: BoardMember,
): BoardMemberFormValues {
  return {
    name: member?.name ?? "",
    position: member?.position ?? "",
    phone: member?.phone ?? "",
    email: member?.email ?? "",
    startDate: toDay(member?.startDate ?? null),
    endDate: toDay(member?.endDate ?? null),
    isActive: member?.isActive ?? true,
  };
}

/**
 * The add and edit forms of a member of the yayasan's organs. Only the fields
 * the API stores are asked for — the old forms also asked for an address and
 * a biography, which went nowhere.
 */
export function BoardMemberForm({
  initial,
  pending,
  onSubmit,
}: {
  initial: BoardMemberFormValues;
  pending: boolean;
  onSubmit: (values: BoardMemberFormValues) => void;
}) {
  const form = useForm<BoardMemberFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Identitas</CardTitle>
              <CardDescription>
                Nama dan jabatan seperti tertulis di akta atau SK pengangkatan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Lengkap</FormLabel>
                    <FormControl>
                      <Input placeholder="Nama beserta gelar" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jabatan</FormLabel>
                    <FormControl>
                      <Input list="board-member-positions" {...field} />
                    </FormControl>
                    <datalist id="board-member-positions">
                      {BOARD_MEMBER_POSITIONS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                    <FormDescription>
                      Pembina, Pengawas, atau jabatan Pengurus (Ketua,
                      Sekretaris, Bendahara)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nomor Telepon</FormLabel>
                    <FormControl>
                      <Input inputMode="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Masa Jabatan</CardTitle>
              <CardDescription>
                Kosongkan tanggal yang belum diketahui — jangan ditebak
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      <FormLabel>Tanggal Berakhir</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>
                        Kosongkan jika masih menjabat
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mt-0!">Masih menjabat</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Button variant="outline" asChild>
            <Link href="/foundation?tab=board">Batal</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </div>
      </form>
    </Form>
  );
}
