"use client";
import { useState } from "react";
import { mayAdministerHr } from "@/lib/rbac";
import { safeFormat } from "@/lib/date";
import {
  useLeaveRequests,
  useCancelLeaveRequest,
  useApproveLeaveRequest,
  LEAVE_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
} from "@/hooks/use-hr";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Check, Filter } from "lucide-react";

import { LeaveRequestDialog } from "@/components/hr/LeaveRequestDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function LeavesPageContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("my-leaves");
  const [page, setPage] = useState(1);

  // Fetch My Leaves
  // Since backend filters by user automatically if not admin, we can reuse query.
  // But for Admin, they might want to see "All".
  // Governance roles collapse to the legacy UNIT_ADMIN bucket but may only
  // *oversee* personnel data — the API refuses their leave writes (403). Gate
  // on the RoleCode so the UI never offers a button the server will reject.
  const isAdmin = mayAdministerHr(user);

  // For "My Leaves", if admin, we might need to pass their own ID?
  // But admins usually don't apply for leave in this system or they do via same UI.
  // Let's assume admins only manage for now, or use "All" tab.

  const { data: myLeavesData, isLoading: myLoading } = useLeaveRequests({
    page,
    limit: 10,
    mine: true, // Explicitly filter by current user (for Admins too)
  });

  const { data: allLeavesData, isLoading: allLoading } = useLeaveRequests({
    page,
    limit: 20,
    // No filters = All (for admin)
  });

  const cancelMutation = useCancelLeaveRequest();
  const approveMutation = useApproveLeaveRequest();

  const handleCancel = async (id: string) => {
    try {
      await cancelMutation.mutateAsync(id);
      toast.success("Leave request cancelled");
    } catch (error) {
      toast.error("Failed to cancel request");
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync(id);
      toast.success("Leave request approved");
    } catch (error) {
      toast.error("Failed to approve request");
    }
  };

  const renderTable = (
    leaves: any[],
    isLoading: boolean,
    showActions: boolean,
  ) => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin" />
        </div>
      );
    }

    if (leaves.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No leave requests found.
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaves.map((leave) => (
              <TableRow key={leave.id}>
                <TableCell>
                  <div className="font-medium">
                    {leave.staff?.user?.name ||
                      leave.teacher?.user?.name ||
                      "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {leave.staff ? "Staff" : "Teacher"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {
                      LEAVE_TYPE_LABELS[
                        leave.type as keyof typeof LEAVE_TYPE_LABELS
                      ]
                    }
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {safeFormat(new Date(leave.startDate), "MMM d, yyyy")} -{" "}
                    {safeFormat(new Date(leave.endDate), "MMM d, yyyy")}
                  </div>
                </TableCell>
                <TableCell>{leave.totalDays} Days</TableCell>
                <TableCell
                  className="max-w-[200px] truncate"
                  title={leave.reason}
                >
                  {leave.reason}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      leave.status === "APPROVED"
                        ? "default"
                        : leave.status === "REJECTED"
                          ? "destructive"
                          : leave.status === "CANCELLED"
                            ? "secondary"
                            : "outline"
                    }
                  >
                    {
                      LEAVE_STATUS_LABELS[
                        leave.status as keyof typeof LEAVE_STATUS_LABELS
                      ]
                    }
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {showActions && leave.status === "PENDING" && isAdmin ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => handleApprove(leave.id)}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      {/* Reject logic needs dialog for reason, simplified here */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => handleCancel(leave.id)}
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    leave.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(leave.id)}
                      >
                        Cancel
                      </Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
        <LeaveRequestDialog>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Request Leave
          </Button>
        </LeaveRequestDialog>
      </div>

      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-leaves">My Leaves</TabsTrigger>
            <TabsTrigger value="all-leaves">All Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="my-leaves" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Leave History</CardTitle>
              </CardHeader>
              <CardContent>
                {renderTable(myLeavesData?.data || [], myLoading, false)}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="all-leaves" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Leave Requests</CardTitle>
              </CardHeader>
              <CardContent>
                {renderTable(allLeavesData?.data || [], allLoading, true)}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>My Leave History</CardTitle>
          </CardHeader>
          <CardContent>
            {renderTable(myLeavesData?.data || [], myLoading, false)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function LeavesPage() {
  return (
    <MainLayout>
      <LeavesPageContent />
    </MainLayout>
  );
}
