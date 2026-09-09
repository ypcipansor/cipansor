"use client";

import { DataTable } from "@/components/shared/data-table";
import { useRisks } from "@/hooks/use-risk";
import { RiskStatusBadge, RiskLevelBadge } from "@/components/risk/risk-badges";
import { Button } from "@/components/ui/button";
import { Plus, Eye, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { type ColumnDef } from "@/components/shared";
import { Risk } from "@/types/risk";

const columns: ColumnDef<Risk>[] = [
  {
    accessorKey: "code",
    header: "Code",
  },
  {
    accessorKey: "category",
    header: "Category",
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <div
        className="max-w-[300px] truncate"
        title={row.getValue("description")}
      >
        {row.getValue("description")}
      </div>
    ),
  },
  {
    accessorKey: "riskLevel",
    header: "Level",
    cell: ({ row }) => <RiskLevelBadge level={row.getValue("riskLevel")} />,
  },
  {
    accessorKey: "riskScore",
    header: "Score",
  },
  {
    id: "audit",
    header: "Temuan Audit",
    cell: ({ row }) => {
      const findings = row.original.auditFindings || [];
      if (findings.length === 0) return "-";
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1 text-orange-600 border-orange-200 bg-orange-50"
        >
          <AlertTriangle className="w-3 h-3" />
          {findings.length} temuan
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <RiskStatusBadge status={row.getValue("status")} />,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <Link href={`/risk-management/${row.original.id}`}>
        <Button variant="ghost" size="sm">
          <Eye className="w-4 h-4" />
        </Button>
      </Link>
    ),
  },
];

export function RiskList() {
  const { data, isLoading } = useRisks();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Risk Register</h2>
        <Link href="/risk-management/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Add Risk
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <DataTable columns={columns} data={data || []} />
      )}
    </div>
  );
}
