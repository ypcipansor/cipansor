"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, User as UserIcon, Star, Target } from "lucide-react";

interface TalentProfile {
  id: string;
  name: string;
  currentRole: string;
  performanceScore: number;
  potentialScore: number;
  category: string;
}

interface TalentMatrixProps {
  profiles: TalentProfile[];
}

const GRID_CELLS = [
  {
    id: "HIGH_POTENTIAL",
    label: "High Potential",
    performance: "High",
    potential: "High",
    color: "bg-emerald-100 border-emerald-500",
  },
  {
    id: "KEY_TALENT",
    label: "Key Talent",
    performance: "Moderate",
    potential: "High",
    color: "bg-blue-100 border-blue-500",
  },
  {
    id: "EMERGING",
    label: "Emerging",
    performance: "Moderate",
    potential: "Moderate",
    color: "bg-slate-100 border-slate-400",
  },
  {
    id: "SOLID_PERFORMER",
    label: "Solid Performer",
    performance: "High",
    potential: "Low",
    color: "bg-emerald-50 border-emerald-300",
  },
  {
    id: "NEEDS_DEVELOPMENT",
    label: "Needs Development",
    performance: "Low",
    potential: "Low",
    color: "bg-red-100 border-red-500",
  },
];

export function TalentMatrix({ profiles }: TalentMatrixProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    (typeof GRID_CELLS)[0] | null
  >(null);

  const handleCellClick = (cellId: string) => {
    const cell = GRID_CELLS.find((c) => c.id === cellId);
    if (cell) setSelectedCategory(cell);
  };

  const getFilteredProfiles = (categoryId: string) => {
    return profiles
      .filter((p) => p.category === categoryId)
      .sort(
        (a, b) =>
          b.performanceScore +
          b.potentialScore -
          (a.performanceScore + a.potentialScore),
      );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Talent categories mapped from backend's 5-value TalentCategory enum */}
        {GRID_CELLS.map((cell) => {
          const cellProfiles = getFilteredProfiles(cell.id);

          return (
            <Card
              key={cell.id}
              className={`p-4 border-2 min-h-[150px] cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${cell.color}`}
              onClick={() => handleCellClick(cell.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  {cell.label}
                </span>
                <Badge variant="outline" className="bg-white/50">
                  {cellProfiles.length}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                <TooltipProvider>
                  {cellProfiles.slice(0, 10).map((profile) => (
                    <Tooltip key={profile.id}>
                      <TooltipTrigger asChild>
                        <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-[10px] font-bold shadow-sm">
                          {(profile.name || "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <p className="font-bold">{profile.name}</p>
                          <p>{profile.currentRole}</p>
                          <p className="mt-1 border-t pt-1">
                            Perf: {profile.performanceScore} | Pot:{" "}
                            {profile.potentialScore}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {cellProfiles.length > 10 && (
                    <div className="w-8 h-8 rounded-full bg-white/50 border flex items-center justify-center text-[10px] font-medium italic">
                      +{cellProfiles.length - 10}
                    </div>
                  )}
                </TooltipProvider>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Drill-down Dialog */}
      <Dialog
        open={!!selectedCategory}
        onOpenChange={(open) => !open && setSelectedCategory(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-primary" />
              <DialogTitle>{selectedCategory?.label} Pool</DialogTitle>
            </div>
            <DialogDescription>
              Performance:{" "}
              <span className="font-semibold">
                {selectedCategory?.performance}
              </span>{" "}
              | Potential:{" "}
              <span className="font-semibold text-primary">
                {selectedCategory?.potential}
              </span>
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] mt-4">
            <div className="grid gap-3 pr-4">
              {selectedCategory &&
                getFilteredProfiles(selectedCategory.id).map((profile) => (
                  <Card
                    key={profile.id}
                    className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 border flex items-center justify-center text-sm font-bold text-primary">
                        {(profile.name || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold leading-none">
                          {profile.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {profile.currentRole}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-medium">
                            Perf: {profile.performanceScore}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <Target className="w-3 h-3 text-blue-500" />
                          <span className="text-xs font-medium">
                            Pot: {profile.potentialScore}
                          </span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-5">
                        Score:{" "}
                        {profile.performanceScore + profile.potentialScore}
                      </Badge>
                    </div>
                  </Card>
                ))}
              {selectedCategory &&
                getFilteredProfiles(selectedCategory.id).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground italic text-sm">
                    No employees currently in this category.
                  </div>
                )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="text-center text-xs font-medium text-muted-foreground px-2">
        <span>Ordered by performance + potential score (highest → lowest)</span>
      </div>
    </div>
  );
}
