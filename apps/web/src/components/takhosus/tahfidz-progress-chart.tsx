"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Medal } from "lucide-react";

interface TahfidzProgressChartProps {
  data: {
    date: string;
    totalAyah: number;
  }[];
}

export function TahfidzProgressChart({ data }: TahfidzProgressChartProps) {
  return (
    <Card className="shadow-sm border-emerald-100 overflow-hidden">
      <CardHeader className="bg-emerald-50/50 border-b pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
              <Medal className="h-5 w-5" />
              Kurva Capaian Tahfidz
            </CardTitle>
            <CardDescription>
              Visualisasi pertumbuhan jumlah ayat yang dihafal
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 h-[350px]">
        {!data || data.length === 0 ? (
          <div className="h-full flex items-center justify-center border-2 border-dashed rounded-lg text-muted-foreground">
            Belum ada data progres hafalan.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorAyah" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#ecfdf5"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(str) => {
                  try {
                    // monthlyProgress data uses "YYYY-MM" format — parse as month/year only
                    const [year, month] = str.split("-");
                    if (year && month) {
                      const d = new Date(Number(year), Number(month) - 1);
                      return d.toLocaleDateString("id-ID", {
                        month: "short",
                        year: "numeric",
                      });
                    }
                    return new Date(str).toLocaleDateString("id-ID", {
                      month: "short",
                      year: "numeric",
                    });
                  } catch {
                    return str;
                  }
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                }}
                labelFormatter={(label) => {
                  try {
                    const [year, month] = String(label).split("-");
                    if (year && month) {
                      const d = new Date(Number(year), Number(month) - 1);
                      return d.toLocaleDateString("id-ID", {
                        month: "long",
                        year: "numeric",
                      });
                    }
                    return String(label);
                  } catch {
                    return String(label);
                  }
                }}
              />
              <Area
                type="monotone"
                dataKey="totalAyah"
                name="Total Ayat"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorAyah)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
