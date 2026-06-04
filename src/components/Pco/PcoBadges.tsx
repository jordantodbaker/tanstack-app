import type { PcoPriority, PcoStatus } from "~/utils/pco";
import { PCO_PRIORITY_LABELS, PCO_STATUS_LABELS } from "~/utils/pcoLabels";
import {
  makeEnumBadge,
  SHARED_PRIORITY_STYLES,
  VOID_PILL_STYLE,
} from "~/components/ui/enum-badge";

const STATUS_STYLES: Record<PcoStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
  // SUBMITTED is the "waiting on owner" state — stand-out colour.
  SUBMITTED: "bg-amber-50 text-amber-800 border-amber-300",
  // NEGOTIATING is louder; owner has pushed back.
  NEGOTIATING: "bg-orange-50 text-orange-800 border-orange-300",
  // APPROVED is the "money is committed but not collected" state.
  APPROVED: "bg-violet-50 text-violet-800 border-violet-300",
  // INVOICED means we've billed; outstanding receivable.
  INVOICED: "bg-sky-50 text-sky-800 border-sky-300",
  // CLOSED is paid — the success terminal.
  CLOSED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-300",
  VOID: VOID_PILL_STYLE,
};

const PRIORITY_STYLES: Record<PcoPriority, string> = SHARED_PRIORITY_STYLES;

const PcoStatusBadgeBase = makeEnumBadge({
  labels: PCO_STATUS_LABELS,
  styles: STATUS_STYLES,
  shape: "pill",
});

const PcoPriorityBadgeBase = makeEnumBadge({
  labels: PCO_PRIORITY_LABELS,
  styles: PRIORITY_STYLES,
  shape: "tag",
});

export function PcoStatusBadge({ status }: { status: PcoStatus }) {
  return <PcoStatusBadgeBase value={status} />;
}

export function PcoPriorityBadge({ priority }: { priority: PcoPriority }) {
  return <PcoPriorityBadgeBase value={priority} />;
}
