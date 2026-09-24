"use client";

import { MainLayout } from "@/components/layout";
import { useMyIbadahAchievements, getStreakEmoji } from "@/hooks/use-ibadah";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Flame, Star } from "lucide-react";

export default function StudentAchievementsPage() {
  const { data: achievements, isLoading, isError } = useMyIbadahAchievements();

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Prestasi Ibadah Saya
          </h1>
          <p className="text-muted-foreground">
            Poin, level, streak, dan badge dari catatan ibadah harianmu
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : isError || !achievements ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Data prestasi belum tersedia. Mulai catat ibadah harianmu untuk
              mengumpulkan poin.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    Level
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold mb-1">
                    LV {achievements.level}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {achievements.totalPoints} Total Poin
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Progres ke LV {achievements.level + 1}</span>
                      <span>{achievements.progressToNextLevel}%</span>
                    </div>
                    <Progress
                      value={achievements.progressToNextLevel}
                      className="h-2"
                    />
                    <p className="text-[10px] text-muted-foreground text-center">
                      {achievements.nextLevelAt - achievements.totalPoints} poin
                      lagi untuk naik level
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
                    Streak Ibadah
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-6">
                  <div className="text-5xl font-extrabold text-orange-600 mb-1">
                    {achievements.currentStreak}
                    <span className="text-2xl ml-1">
                      {getStreakEmoji(achievements.currentStreak)}
                    </span>
                  </div>
                  <div className="text-sm font-medium">HARI BERTURUT-TURUT</div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {achievements.currentStreak > 0
                      ? "Luar biasa! Pertahankan istiqomahmu."
                      : "Ayo mulai catat ibadahmu hari ini!"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Badge Terkoleksi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {achievements.badges.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Belum ada badge. Kumpulkan poin dan jaga streak untuk
                      membuka badge pertamamu.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {achievements.badges.map((badge) => (
                        <div
                          key={badge.id}
                          className="flex flex-col items-center p-3 border rounded-xl bg-muted/30"
                          title={badge.name}
                        >
                          <span className="text-3xl mb-1">{badge.icon}</span>
                          <span className="text-[10px] font-semibold text-center">
                            {badge.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
