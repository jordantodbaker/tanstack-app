import type { RfiPriority, RfiStatus } from "~/utils/rfis";
import { RFI_PRIORITY_LABELS, RFI_STATUS_LABELS } from "~/utils/rfiLabels";
import {
  makeEnumBadge,
  SHARED_PRIORITY_STYLES,
  VOID_PILL_STYLE,
} from "~/components/ui/enum-badge";

const STATUS_STYLES: Record<RfiStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
  // OPEN draws attention — there's a question waiting for an answer.
  OPEN: "bg-amber-50 text-amber-800 border-amber-300",
  ANSWERED: "bg-indigo-50 text-indigo-700 border-indigo-300",
  CLOSED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  SUPERSEDED: "bg-violet-50 text-violet-700 border-violet-300",
  VOID: VOID_PILL_STYLE,
};

const PRIORITY_STYLES: Record<RfiPriority, string> = SHARED_PRIORITY_STYLES;

const RfiStatusBadgeBase = makeEnumBadge({
  labels: RFI_STATUS_LABELS,
  styles: STATUS_STYLES,
  shape: "pill",
});

const RfiPriorityBadgeBase = makeEnumBadge({
  labels: RFI_PRIORITY_LABELS,
  styles: PRIORITY_STYLES,
  shape: "tag",
});

export function RfiStatusBadge({ status }: { status: RfiStatus }) {
  return <RfiStatusBadgeBase value={status} />;
}

export function RfiPriorityBadge({ priority }: { priority: RfiPriority }) {
  return <RfiPriorityBadgeBase value={priority} />;
}
