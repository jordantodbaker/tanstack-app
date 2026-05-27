import type { TrendPriority, TrendStatus } from "~/utils/trends";
import {
  TREND_PRIORITY_LABELS,
  TREND_STATUS_LABELS,
} from "~/utils/trendLabels";

const STATUS_STYLES: Record<TrendStatus, string> = {
  // IDENTIFIED is the "fresh hunch" state; soft so it doesn't shout from a
  // dense list of CVRs/FCOs that the PM is also scanning.
  IDENTIFIED: "bg-slate-100 text-slate-700 border-slate-300",
  // PROBABLE is the endorsed state — it has moved AFC, so it's loud.
  PROBABLE: "bg-amber-50 text-amber-800 border-amber-300",
  // CONVERTED is terminal-good; the trend became a real CVR.
  CONVERTED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-300",
  VOID: "bg-slate-50 text-slate-400 border-slate-200 line-through",
};

export function TrendStatusBadge({ status }: { status: TrendStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {TREND_STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<TrendPriority, string> = {
  LOW: "bg-slate-100 text-slate-700",
  NORMAL: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800 animate-pulse",
};

export function TrendPriorityBadge({ priority }: { priority: TrendPriority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {TREND_PRIORITY_LABELS[priority]}
    </span>
  );
}
