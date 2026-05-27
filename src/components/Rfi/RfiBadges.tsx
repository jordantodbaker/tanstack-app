import type { RfiPriority, RfiStatus } from "~/utils/rfis";
import {
  RFI_PRIORITY_LABELS,
  RFI_STATUS_LABELS,
} from "~/utils/rfiLabels";

const STATUS_STYLES: Record<RfiStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
  // OPEN draws attention — there's a question waiting for an answer.
  OPEN: "bg-amber-50 text-amber-800 border-amber-300",
  ANSWERED: "bg-indigo-50 text-indigo-700 border-indigo-300",
  CLOSED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  SUPERSEDED: "bg-violet-50 text-violet-700 border-violet-300",
  VOID: "bg-slate-50 text-slate-400 border-slate-200 line-through",
};

export function RfiStatusBadge({ status }: { status: RfiStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {RFI_STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<RfiPriority, string> = {
  LOW: "bg-slate-100 text-slate-700",
  NORMAL: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800 animate-pulse",
};

export function RfiPriorityBadge({ priority }: { priority: RfiPriority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {RFI_PRIORITY_LABELS[priority]}
    </span>
  );
}
