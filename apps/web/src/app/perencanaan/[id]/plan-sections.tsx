"use client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  CalendarDays,
  Coins,
  ChevronRight,
  Wallet,
  TrendingUp,
} from "lucide-react";
import type {
  PlanActivity,
  PlanIndicator,
  PlanFundingSource,
} from "@/hooks/use-perencanaan";

const rp = (n?: number | null) =>
  n == null ? "—" : `Rp ${Number(n).toLocaleString("id-ID")}`;

const levelColor: Record<string, string> = {
  IUP: "bg-violet-50 text-violet-700 border-violet-200",
  IKU: "bg-blue-50 text-blue-700 border-blue-200",
  IKP: "bg-amber-50 text-amber-700 border-amber-200",
  IKK: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const kindColor: Record<string, string> = {
  PROGRAM: "bg-indigo-50 text-indigo-700 border-indigo-200",
  KEGIATAN: "bg-slate-100 text-slate-600 border-slate-200",
  SUBKEGIATAN: "bg-slate-50 text-slate-500 border-slate-200",
};

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** The ● jadwal-bulanan matrix as a compact 12-dot strip. */
export function ScheduleStrip({ months }: { months?: number[] }) {
  if (!months || months.length === 0) return null;
  const set = new Set(months);
  return (
    <div className="flex items-center gap-1 mt-2">
      <CalendarDays className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="flex gap-[3px]">
        {MONTHS.map((m, i) => (
          <span
            key={i}
            title={`Bulan ${i + 1}`}
            className={`w-4 h-4 rounded-[3px] text-[9px] leading-4 text-center font-medium ${
              set.has(i + 1)
                ? "bg-primary text-primary-foreground"
                : "bg-slate-100 text-slate-300"
            }`}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Staged targets (Tahap I–IV / per tahun / triwulanan) as compact chips. */
export function StagedTargets({ indicator }: { indicator: PlanIndicator }) {
  if (!indicator.targets || indicator.targets.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <TrendingUp className="w-3 h-3 text-muted-foreground shrink-0" />
      {indicator.baseline != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
          Baseline {indicator.baseline}
        </span>
      )}
      {indicator.targets.map((t) => (
        <span
          key={t.id}
          className="text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/15 whitespace-nowrap"
        >
          {t.period}: <span className="font-semibold">{t.targetValue}</span>
          {t.actualValue != null && (
            <span className="text-emerald-600"> · real {t.actualValue}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Kamus Indikator metadata (definisi/formula/sumber/frekuensi/PIC). */
function KamusMeta({ indicator }: { indicator: PlanIndicator }) {
  const rows: [string, string][] = [];
  if (indicator.definition) rows.push(["Definisi", indicator.definition]);
  if (indicator.formula) rows.push(["Formula", indicator.formula]);
  if (indicator.dataSource) rows.push(["Sumber data", indicator.dataSource]);
  if (indicator.frequency) rows.push(["Frekuensi", indicator.frequency]);
  if (indicator.picRole) rows.push(["Penanggung jawab", indicator.picRole]);
  if (rows.length === 0) return null;
  return (
    <details className="mt-1 group">
      <summary className="text-[10px] text-muted-foreground cursor-pointer inline-flex items-center gap-0.5 hover:text-foreground">
        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
        Kamus indikator
      </summary>
      <dl className="mt-1 ml-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-medium text-slate-500">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function IndicatorRow({ indicator }: { indicator: PlanIndicator }) {
  return (
    <div className="text-sm">
      <div className="flex justify-between items-start gap-2">
        <span className="text-slate-700 flex items-center gap-1.5">
          {indicator.level && (
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${levelColor[indicator.level] ?? ""}`}
            >
              {indicator.level}
            </Badge>
          )}
          {indicator.name}
        </span>
        <div className="text-right shrink-0">
          <span className="font-medium">{indicator.currentValue}</span>
          <span className="text-slate-400 mx-1">/</span>
          <span className="text-slate-500">
            {indicator.targetValue} {indicator.unit}
          </span>
        </div>
      </div>
      <StagedTargets indicator={indicator} />
      <KamusMeta indicator={indicator} />
    </div>
  );
}

/** RAB rinci — uraian × volume × harga satuan = jumlah. */
function RabTable({
  items,
}: {
  items: NonNullable<PlanActivity["budgetItems"]>;
}) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  return (
    <details className="mt-3 group">
      <summary className="text-[11px] font-medium text-slate-500 cursor-pointer inline-flex items-center gap-0.5 hover:text-foreground">
        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
        <Wallet className="w-3 h-3" /> RAB rinci ({items.length} baris)
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-slate-400 border-b">
              <th className="py-1 pr-2 font-medium">Uraian</th>
              <th className="py-1 px-2 font-medium text-right">Vol</th>
              <th className="py-1 px-2 font-medium">Satuan</th>
              <th className="py-1 px-2 font-medium text-right">Harga</th>
              <th className="py-1 pl-2 font-medium text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-slate-100">
                <td className="py-1 pr-2">{i.description}</td>
                <td className="py-1 px-2 text-right tabular-nums">
                  {i.volume}
                </td>
                <td className="py-1 px-2">{i.unit}</td>
                <td className="py-1 px-2 text-right tabular-nums">
                  {rp(i.unitPrice)}
                </td>
                <td className="py-1 pl-2 text-right tabular-nums">
                  {rp(i.amount)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1 pr-2" colSpan={4}>
                Subtotal
              </td>
              <td className="py-1 pl-2 text-right tabular-nums">{rp(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

const statusColor: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  DRAFT: "bg-slate-100 text-slate-500 border-slate-200",
};

/** One activity (Program or Kegiatan) + its IKK, schedule, RAB, and children. */
export function ActivityCard({ act }: { act: PlanActivity }) {
  const isProgram = act.kind === "PROGRAM";
  return (
    <div
      className={`rounded-lg border p-3 ${
        isProgram ? "bg-indigo-50/30 border-indigo-100" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          {act.kind && (
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 shrink-0 mt-0.5 ${kindColor[act.kind] ?? ""}`}
            >
              {act.kind}
            </Badge>
          )}
          <h5 className="font-medium text-sm leading-snug">{act.title}</h5>
        </div>
        <div className="flex gap-1 shrink-0">
          <Badge
            variant="outline"
            className={`text-[10px] ${statusColor[act.status] ?? ""}`}
          >
            {act.status}
          </Badge>
        </div>
      </div>

      {act.description && (
        <p className="text-xs text-muted-foreground mt-1">{act.description}</p>
      )}

      <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground mt-2">
        <Badge variant="outline" className="text-[10px]">
          {act.priority}
        </Badge>
        {Number(act.budget) > 0 && (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <Coins className="w-3 h-3" /> {rp(act.budget)}
          </span>
        )}
        {Number(act.budget) > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-100"
          >
            Realisasi:{" "}
            {Math.min(
              100,
              Math.round(((act.realization || 0) / Number(act.budget)) * 100),
            )}
            %
          </Badge>
        )}
        {act.pic && (
          <span className="inline-flex items-center gap-1">
            👤 {act.pic.name}
          </span>
        )}
      </div>

      <ScheduleStrip months={act.scheduleMonths} />

      {act.indicators && act.indicators.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-2">
          {act.indicators.map((ind) => (
            <IndicatorRow key={ind.id} indicator={ind} />
          ))}
        </div>
      )}

      {act.budgetItems && act.budgetItems.length > 0 && (
        <RabTable items={act.budgetItems} />
      )}

      {act.children && act.children.length > 0 && (
        <div className="mt-3 ml-3 pl-3 border-l-2 border-indigo-100 space-y-2">
          {act.children.map((child) => (
            <ActivityCard key={child.id} act={child} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Proyeksi pendapatan per sumber dana + keseimbangan pendapatan vs belanja. */
export function FundingSection({
  sources,
  totalBelanja,
}: {
  sources: PlanFundingSource[];
  totalBelanja: number;
}) {
  const totalPendapatan = sources.reduce(
    (s, f) => s + Number(f.amount ?? 0),
    0,
  );
  const surplus = totalPendapatan - totalBelanja;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-slate-400 border-b">
              <th className="py-2 pr-2 font-medium">Sumber Dana</th>
              <th className="py-2 pl-2 font-medium text-right">Proyeksi</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2">
                  <div className="font-medium">{f.name}</div>
                  {f.basis && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {f.basis}
                    </div>
                  )}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">
                  {f.amount == null ? (
                    <span className="text-muted-foreground italic">[Rp …]</span>
                  ) : (
                    rp(f.amount)
                  )}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-2">Total Pendapatan Terproyeksi</td>
              <td className="py-2 pl-2 text-right tabular-nums">
                {rp(totalPendapatan)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-[11px] text-muted-foreground">Pendapatan</div>
          <div className="text-sm font-semibold text-emerald-700">
            {rp(totalPendapatan)}
          </div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-[11px] text-muted-foreground">Belanja</div>
          <div className="text-sm font-semibold text-blue-700">
            {rp(totalBelanja)}
          </div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-[11px] text-muted-foreground">
            {surplus >= 0 ? "Surplus" : "Defisit"}
          </div>
          <div
            className={`text-sm font-semibold ${
              surplus >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {rp(Math.abs(surplus))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <BarChart3 className="w-3 h-3" /> Prinsip berimbang: total belanja tidak
        melebihi total pendapatan terproyeksi. Nominal bersifat indikatif
        (mock-up demo).
      </p>
    </div>
  );
}
