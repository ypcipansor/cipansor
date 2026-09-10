"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Scan,
  Search,
  LogOut,
  LogIn,
  CheckCircle,
  XCircle,
} from "lucide-react";
import Image from "next/image";

interface Permit {
  id: string;
  code: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  departedAt?: string;
  returnedAt?: string;
  student: {
    id: string;
    nisn: string;
    user: {
      name: string;
      email: string;
      photoUrl?: string;
    };
    unit: {
      name: string;
    };
  };
}

export default function ReceptionGatePage() {
  const [searchCode, setSearchCode] = useState("");
  const [activeCode, setActiveCode] = useState("");

  const {
    data: permit,
    isLoading,
    refetch,
  } = useQuery<Permit>({
    queryKey: ["permit", activeCode],
    queryFn: async () => {
      const res = await api.get(`/permits/code/${activeCode}`);
      return res.data.data;
    },
    enabled: !!activeCode,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    setActiveCode(searchCode.trim());
  };

  const departMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/permits/${id}/depart`);
    },
    onSuccess: () => {
      toast.success("Student marked as DEPARTED");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to mark departure");
    },
  });

  const returnMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.put(`/permits/${id}/return`, {});
    },
    onSuccess: () => {
      toast.success("Student marked as RETURNED");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to mark return");
    },
  });

  const getStatusBadge = (permit: Permit) => {
    if (permit.returnedAt)
      return <Badge className="bg-blue-500">RETURNED</Badge>;
    if (permit.departedAt)
      return <Badge className="bg-orange-500">OUT (KELUAR)</Badge>;
    if (permit.status === "APPROVED")
      return <Badge className="bg-green-500">APPROVED</Badge>;
    return <Badge variant="secondary">{permit.status}</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-3xl">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Security Gate</h1>
        <p className="text-muted-foreground">
          Scan or enter permit code to verify student movement.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan Permit</CardTitle>
          <CardDescription>
            Enter the code from the student's permit card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Scan className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Scan or type code (e.g. PMT-X89...)"
                className="pl-9"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit">
              <Search className="h-4 w-4 mr-2" />
              Verify
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <div className="text-center py-4">Checking permit...</div>}

      {permit && (
        <Card
          className={
            permit.status === "APPROVED" || permit.status === "COMPLETED"
              ? "border-green-500/50"
              : "border-red-500/50"
          }
        >
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {permit.student.user.name}
                  {getStatusBadge(permit)}
                </CardTitle>
                <CardDescription>
                  {permit.student.unit.name} • {permit.student.nisn}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold">
                  {permit.code}
                </div>
                <div className="text-sm text-muted-foreground">
                  {permit.type}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-6">
              <div className="h-32 w-32 relative bg-muted rounded-md overflow-hidden flex-shrink-0">
                {permit.student.user.photoUrl ? (
                  <Image
                    src={permit.student.user.photoUrl}
                    alt={permit.student.user.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No Photo
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block">
                      Start Date
                    </span>
                    <span className="font-medium">
                      {new Date(permit.startDate).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">
                      End Date
                    </span>
                    <span className="font-medium">
                      {new Date(permit.endDate).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block">Reason</span>
                    <span className="font-medium">{permit.reason}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4 border-t">
              {!permit.departedAt && permit.status === "APPROVED" && (
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={() => departMutation.mutate(permit.id)}
                  disabled={departMutation.isPending}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  CHECK OUT (DEPART)
                </Button>
              )}

              {permit.departedAt && !permit.returnedAt && (
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  size="lg"
                  onClick={() => returnMutation.mutate(permit.id)}
                  disabled={returnMutation.isPending}
                >
                  <LogIn className="mr-2 h-5 w-5" />
                  CHECK IN (RETURN)
                </Button>
              )}

              {permit.returnedAt && (
                <div className="w-full p-4 bg-blue-50 text-blue-800 rounded-md flex items-center justify-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Student has returned at{" "}
                  {new Date(permit.returnedAt).toLocaleTimeString("id-ID")}
                </div>
              )}

              {permit.status !== "APPROVED" &&
                permit.status !== "COMPLETED" && (
                  <div className="w-full p-4 bg-red-50 text-red-800 rounded-md flex items-center justify-center gap-2">
                    <XCircle className="h-5 w-5" />
                    Permit is {permit.status}. Cannot process.
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
