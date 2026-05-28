import type { FcoPriority, FcoStatus } from "~/utils/fcoLog";
import {
  FCO_ORIGIN_LABELS,
  FCO_PRIORITY_LABELS,
  FCO_STATUS_LABELS,
} from "~/utils/fcoLogLabels";
import { makeEnumBadge } from "~/components/ui/enum-badge";

const STATUS_STYLES: Record<FcoStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
  SUBMITTED: "bg-blue-50 text-blue-700 border-blue-300",
  IN_REVIEW: "bg-indigo-50 text-indigo-700 border-indigo-300",
  LINKED_TO_CVR: "bg-violet-50 text-violet-700 border-violet-300",
  APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  REJECTED: "bg-red-50 text-red-700 border-red-300",
  IMPLEMENTED: "bg-teal-50 text-teal-700 border-teal-300",
  CLOSED: "bg-slate-200 text-slate-700 border-slate-300",
  VOID: "bg-slate-50 text-slate-400 border-slate-200 line-through",
};

const PRIORITY_STYLES: Record<FcoPriority, string> = {
  LOW: "bg-slate-100 text-slate-700",
  NORMAL: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800 animate-pulse",
};

const FcoStatusBadgeBase = makeEnumBadge({
  labels: FCO_STATUS_LABELS,
  styles: STATUS_STYLES,
  shape: "pill",
});

const FcoPriorityBadgeBase = makeEnumBadge({
  labels: FCO_PRIORITY_LABELS,
  styles: PRIORITY_STYLES,
  shape: "tag",
});

export function FcoStatusBadge({ status }: { status: FcoStatus }) {
  return <FcoStatusBadgeBase value={status} />;
}

export function FcoPriorityBadge({ priority }: { priority: FcoPriority }) {
  return <FcoPriorityBadgeBase value={priority} />;
}

export { FCO_STATUS_LABELS, FCO_PRIORITY_LABELS, FCO_ORIGIN_LABELS };
