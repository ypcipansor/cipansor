import { id } from "date-fns/locale";
import { safeFormat } from "@/lib/date";
import type { LetterFlowEventDetail } from "@cipansor/shared";
import {
  FilePlus2,
  Send,
  Check,
  PenLine,
  Undo2,
  RotateCcw,
  Share2,
  ClipboardCheck,
  Mail,
  Archive,
  FilePen,
  type LucideIcon,
} from "lucide-react";

/**
 * The letter's journey, told as a story.
 *
 * This is the append-only history the tata usaha asked for: who forwarded or
 * approved or returned the letter, to whom, and when. It reads the
 * LetterFlowEvent rows, which are the events themselves — unlike the reviewer
 * and disposition rows, which only hold the current state and cannot say who
 * returned a draft after it has been resubmitted.
 *
 * Oldest first, because a history is read top to bottom.
 */

interface FlowStyle {
  icon: LucideIcon;
  label: string;
  /** How to phrase the actor's line; `target` is the recipient, if any. */
  sentence: (actor: string, target?: string) => string;
  tone: string;
}

const FLOW: Record<string, FlowStyle> = {
  CREATED: {
    icon: FilePlus2,
    label: "Dicatat",
    sentence: (a) => `${a} mencatat surat ini`,
    tone: "text-muted-foreground",
  },
  EDITED: {
    icon: FilePen,
    label: "Diedit",
    sentence: (a) => `${a} memperbarui naskah surat`,
    tone: "text-muted-foreground",
  },
  SUBMITTED: {
    icon: Send,
    label: "Diajukan",
    sentence: (a) => `${a} mengajukan konsep untuk diverifikasi`,
    tone: "text-blue-600",
  },
  APPROVED: {
    icon: Check,
    label: "Diparaf",
    sentence: (a) => `${a} menyetujui (paraf)`,
    tone: "text-emerald-600",
  },
  SIGNED: {
    icon: PenLine,
    label: "Ditandatangani",
    sentence: (a) => `${a} menandatangani surat`,
    tone: "text-emerald-700",
  },
  REVISION_REQUESTED: {
    icon: Undo2,
    label: "Dikembalikan",
    sentence: (a, t) =>
      t ? `${a} mengembalikan konsep kepada ${t} untuk direvisi` : `${a} meminta revisi`,
    tone: "text-amber-600",
  },
  RESUBMITTED: {
    icon: RotateCcw,
    label: "Diajukan ulang",
    sentence: (a) => `${a} mengajukan ulang setelah revisi`,
    tone: "text-blue-600",
  },
  DISPOSED: {
    icon: Share2,
    label: "Disposisi",
    sentence: (a, t) =>
      t ? `${a} mendisposisikan surat kepada ${t}` : `${a} mendisposisikan surat`,
    tone: "text-indigo-600",
  },
  DISPOSITION_UPDATED: {
    icon: ClipboardCheck,
    label: "Tindak lanjut",
    sentence: (a) => `${a} memperbarui tindak lanjut disposisi`,
    tone: "text-indigo-500",
  },
  SENT: {
    icon: Mail,
    label: "Dikirim",
    sentence: (a) => `${a} mengirim surat`,
    tone: "text-blue-700",
  },
  ARCHIVED: {
    icon: Archive,
    label: "Diarsipkan",
    sentence: (a) => `${a} mengarsipkan surat`,
    tone: "text-muted-foreground",
  },
};

function styleFor(action: string): FlowStyle {
  return (
    FLOW[action] ?? {
      icon: ClipboardCheck,
      label: action,
      sentence: (a) => `${a}: ${action}`,
      tone: "text-muted-foreground",
    }
  );
}

export function LetterFlowHistory({
  events,
}: {
  events?: LetterFlowEventDetail[];
}) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center p-4 text-muted-foreground text-sm">
        Belum ada histori alur.
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {events.map((event, index) => {
        const style = styleFor(event.action);
        const Icon = style.icon;
        const actor = event.actor?.name ?? "Seseorang";
        const target = event.target?.name ?? undefined;
        const isLast = index === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-3 pb-5">
            {/* Connector down to the next event. */}
            {!isLast && (
              <span
                className="absolute left-[15px] top-8 bottom-0 w-px bg-border"
                aria-hidden="true"
              />
            )}
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ${style.tone}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex-1 pt-0.5">
              <p className="text-sm">
                {style.sentence(actor, target)}
              </p>
              {event.note && (
                <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
                  {event.note}
                </p>
              )}
              <time className="mt-1 block text-xs text-muted-foreground">
                {safeFormat(new Date(event.createdAt), "dd MMM yyyy HH:mm", {
                  locale: id,
                })}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
