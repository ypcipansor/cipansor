"use client";

import {
  useOrgMember,
  useCreateLogbook,
} from "@/hooks/student-org/use-student-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useParams } from "next/navigation";

import { MainLayout } from "@/components/layout";
function MemberDetailPageContent() {
  const { id } = useParams();
  const { data: member, isLoading } = useOrgMember(id as string);
  const { mutate: createLogbook, isPending } = useCreateLogbook();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      activity: "",
      result: "",
    },
  });

  const onSubmit = (data: any) => {
    createLogbook(
      { ...data, memberId: id as string },
      {
        onSuccess: () => {
          toast.success("Logbook entry added");
          setIsOpen(false);
          form.reset();
        },
      },
    );
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{member?.student.user.name}</h1>
          <p className="text-muted-foreground">
            {member?.position.name} - {member?.position.org.name}
          </p>
        </div>

        <Button onClick={() => setIsOpen(true)}>Add Logbook Entry</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Logbook</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {member?.logbooks.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {new Date(log.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{log.activity}</TableCell>
                  <TableCell>{log.result}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Simplified Dialog for Logbook */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>New Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <Input type="date" {...form.register("date")} required />
                <Textarea
                  placeholder="Activity Description"
                  {...form.register("activity")}
                  required
                />
                <Textarea
                  placeholder="Result / Outcome"
                  {...form.register("result")}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    Save
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function MemberDetailPage() {
  return (
    <MainLayout>
      <MemberDetailPageContent />
    </MainLayout>
  );
}
