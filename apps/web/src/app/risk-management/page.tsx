"use client";
import { MainLayout } from "@/components/layout";

import { RiskHeatmap } from "@/components/risk/risk-heatmap";
import { RiskList } from "./risk-list";
import { PageHeader } from "@/components/shared/page-header";
import { useRisks } from "@/hooks/use-risk";
import {
  UnitScopeFilter,
  useOverseesAllUnits,
} from "@/components/shared/unit-scope";
import { useState } from "react";

function RiskManagementPageContent() {
  const overseesAll = useOverseesAllUnits();
  const [unitId, setUnitId] = useState<string | undefined>();
  const { data: risks, isLoading } = useRisks(unitId ? { unitId } : undefined);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Manajemen Risiko"
        description={
          overseesAll
            ? "Pantau dan kelola risiko seluruh unit."
            : "Pantau dan kelola risiko unit Anda."
        }
        actions={
          overseesAll && <UnitScopeFilter value={unitId} onChange={setUnitId} />
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex justify-center">
          <RiskHeatmap risks={risks || []} />
        </div>

        {/* Summary Stats can go here */}
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-white shadow-sm">
            <h3 className="font-semibold text-lg">Ringkasan</h3>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="text-center p-2 bg-slate-50 rounded">
                <div className="text-2xl font-bold">{risks?.length || 0}</div>
                <div className="text-xs text-muted-foreground">
                  Total risiko
                </div>
              </div>
              <div className="text-center p-2 bg-slate-50 rounded">
                <div className="text-2xl font-bold text-red-500">
                  {risks?.filter(
                    (r: any) =>
                      r.riskLevel === "EXTREME" || r.riskLevel === "HIGH",
                  ).length || 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Risiko tinggi/ekstrem
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RiskList risks={risks} isLoading={isLoading} showUnit={overseesAll} />
    </div>
  );
}

export default function RiskManagementPageWithShell() {
  return (
    <MainLayout>
      <RiskManagementPageContent />
    </MainLayout>
  );
}
