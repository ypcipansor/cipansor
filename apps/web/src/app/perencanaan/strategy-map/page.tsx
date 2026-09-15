"use client";

import { MainLayout } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePlans } from "@/hooks";
import {
  TrendingUp,
  Users,
  Settings,
  GraduationCap,
  Loader2
} from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const PERSPECTIVE_CONFIG = {
  FINANCIAL: {
    label: "Financial",
    color: "bg-emerald-500",
    cssColor: "#10b981",
    icon: TrendingUp,
    description: "Untuk mencapai keberlanjutan finansial, bagaimana kita harus tampil di hadapan donatur/yayasan?"
  },
  CUSTOMER: {
    label: "Customer (Wali Murid/Siswa)",
    color: "bg-blue-500",
    cssColor: "#3b82f6",
    icon: Users,
    description: "Untuk mencapai visi, bagaimana kita harus tampil di hadapan siswa dan orang tua?"
  },
  PROCESS: {
    label: "Internal Process",
    color: "bg-orange-500",
    cssColor: "#f97316",
    icon: Settings,
    description: "Untuk memuaskan stakeholders, proses bisnis apa yang harus kita unggulkan?"
  },
  LEARNING: {
    label: "Learning & Growth",
    color: "bg-purple-500",
    cssColor: "#a855f7",
    icon: GraduationCap,
    description: "Untuk mencapai visi, bagaimana kita memelihara kemampuan untuk berubah dan berkembang?"
  }
};

export default function StrategyMapPage() {
  const { data: plans, isLoading } = usePlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const selectedPlan = plans?.find(p => p.id === (selectedPlanId || plans[0]?.id));

  if (isLoading) {
    return (
       <MainLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const objectivesByPerspective = (perspective: string) => {
    return selectedPlan?.objectives?.filter(o => o.perspective === perspective) || [];
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Peta Strategi</h1>
            <p className="text-muted-foreground">
              Visualisasi hubungan sebab-akibat sasaran strategis (BSC)
            </p>
          </div>

          <div className="w-[300px]">
             <Select
                value={selectedPlan?.id}
                onValueChange={setSelectedPlanId}
             >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Rencana Strategis" />
                </SelectTrigger>
                <SelectContent>
                  {plans?.map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.title}
                    </SelectItem>
                  ))}
                </SelectContent>
             </Select>
          </div>
        </div>

        {!selectedPlan ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Belum ada rencana strategis yang tersedia.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8">
            {Object.entries(PERSPECTIVE_CONFIG).map(([key, config]) => {
              const objectives = objectivesByPerspective(key);
              const Icon = config.icon;

              return (
                <div key={key} className="relative">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Perspective Header */}
                    <div className="col-span-3 flex flex-col gap-2 p-4 rounded-xl border bg-card shadow-sm">
                       <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${config.color} text-white`}>
                            <Icon size={18} />
                          </div>
                          <span className="font-bold text-sm uppercase tracking-wider">{config.label}</span>
                       </div>
                       <p className="text-[10px] text-muted-foreground italic leading-tight">
                         {config.description}
                       </p>
                    </div>

                    {/* Objectives Row */}
                    <div className="col-span-9 flex flex-wrap gap-4 justify-center py-4 px-8 min-h-[120px] rounded-xl border-2 border-dashed border-muted bg-muted/20">
                       {objectives.length > 0 ? (
                         objectives.map(obj => (
                           <Card key={obj.id} className="w-[220px] border-l-4 shadow-sm" style={{ borderLeftColor: config.cssColor }}>
                             <CardHeader className="p-3">
                               <div className="flex justify-between items-start gap-2">
                                  <CardTitle className="text-xs leading-tight font-bold">{obj.title}</CardTitle>
                                  <Badge variant={obj.progress >= 70 ? "default" : obj.progress >= 40 ? "secondary" : "destructive"} className="text-[10px] h-4 px-1">
                                    {obj.progress}%
                                  </Badge>
                               </div>
                             </CardHeader>
                             <CardContent className="p-3 pt-0">
                                <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                                   <div
                                      className={`h-1.5 rounded-full ${obj.progress >= 70 ? "bg-green-500" : obj.progress >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                                      style={{ width: `${obj.progress}%` }}
                                   />
                                </div>
                                <p className="text-[10px] text-muted-foreground line-clamp-2">
                                  {obj.description || "Tidak ada deskripsi"}
                                </p>
                             </CardContent>
                           </Card>
                         ))
                       ) : (
                         <span className="text-xs text-muted-foreground flex items-center">Belum ada sasaran</span>
                       )}
                    </div>
                  </div>

                  {/* Causality Arrows (Placeholder) */}
                  {key !== 'LEARNING' && (
                    <div className="flex justify-center my-[-10px] z-10 relative">
                       <div className="p-1 bg-background rounded-full border shadow-sm">
                         <TrendingUp size={14} className="text-muted-foreground rotate-180" />
                       </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Catatan Implementasi Peta Strategi</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
             Peta Strategi ini menghubungkan empat perspektif Balanced Scorecard secara logis. Investasi pada <b>Pembelajaran &amp; Pertumbuhan</b> (SDM &amp; Budaya) mendorong perbaikan <b>Proses Internal</b>, yang kemudian meningkatkan kepuasan <b>Pemangku Kepentingan</b> (Siswa/Wali Murid), dan akhirnya menghasilkan kinerja <b>Keuangan</b> yang sehat bagi Yayasan.
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
