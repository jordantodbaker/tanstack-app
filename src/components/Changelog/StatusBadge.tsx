import type {
  ChangeStatus,
  RiskLevel,
} from "~/utils/changelog";
import {
  RISK_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "~/utils/changelogLabels";

const STATUS_STYLES: Record<ChangeStatus, string> = {
  REQUESTED: "bg-slate-100 text-slate-700 border-slate-300",
  IN_REVIEW: "bg-blue-50 text-blue-700 border-blue-300",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800 border-amber-300",
  APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  REJECTED: "bg-red-50 text-red-700 border-red-300",
  EXECUTED: "bg-violet-50 text-violet-700 border-violet-300",
  VOID: "bg-slate-50 text-slate-400 border-slate-200 line-through",
};

export function StatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${RISK_STYLES[level]}`}
    >
      {RISK_LABELS[level]}
    </span>
  );
}

export { STATUS_LABELS, TYPE_LABELS, RISK_LABELS };
