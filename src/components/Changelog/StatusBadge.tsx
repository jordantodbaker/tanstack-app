import type {
  ChangeStatus,
  ChangeType,
  RiskLevel,
} from "~/utils/changelog";

const STATUS_STYLES: Record<ChangeStatus, string> = {
  REQUESTED: "bg-slate-100 text-slate-700 border-slate-300",
  IN_REVIEW: "bg-blue-50 text-blue-700 border-blue-300",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800 border-amber-300",
  APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  REJECTED: "bg-red-50 text-red-700 border-red-300",
  EXECUTED: "bg-violet-50 text-violet-700 border-violet-300",
  VOID: "bg-slate-50 text-slate-400 border-slate-200 line-through",
};

const STATUS_LABELS: Record<ChangeStatus, string> = {
  REQUESTED: "Requested",
  IN_REVIEW: "In Review",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXECUTED: "Executed",
  VOID: "Void",
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

export { STATUS_LABELS };

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
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

export { RISK_LABELS };

const TYPE_LABELS: Record<ChangeType, string> = {
  SCOPE: "Scope",
  COST: "Cost",
  SCHEDULE: "Schedule",
  ENGINEERING: "Engineering",
  CONSTRUCTION: "Construction",
  PROCUREMENT: "Procurement",
  REGULATORY: "Regulatory",
  OTHER: "Other",
};

export { TYPE_LABELS };
