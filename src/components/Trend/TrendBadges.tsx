import type { TrendPriority, TrendStatus } from "~/utils/trends";
import {
  TREND_PRIORITY_LABELS,
  TREND_STATUS_LABELS,
} from "~/utils/trendLabels";
import {
  makeEnumBadge,
  SHARED_PRIORITY_STYLES,
  VOID_PILL_STYLE,
} from "~/components/ui/enum-badge";

const STATUS_STYLES: Record<TrendStatus, string> = {
  // IDENTIFIED is the "fresh hunch" state; soft so it doesn't shout from a
  // dense list of CVRs/FCOs that the PM is also scanning.
  IDENTIFIED: "bg-slate-100 text-slate-700 border-slate-300",
  // PROBABLE is the endorsed state — it has moved AFC, so it's loud.
  PROBABLE: "bg-amber-50 text-amber-800 border-amber-300",
  // CONVERTED is terminal-good; the trend became a real CVR.
  CONVERTED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-300",
  VOID: VOID_PILL_STYLE,
};

const PRIORITY_STYLES: Record<TrendPriority, string> = SHARED_PRIORITY_STYLES;

const TrendStatusBadgeBase = makeEnumBadge({
  labels: TREND_STATUS_LABELS,
  styles: STATUS_STYLES,
  shape: "pill",
});

const TrendPriorityBadgeBase = makeEnumBadge({
  labels: TREND_PRIORITY_LABELS,
  styles: PRIORITY_STYLES,
  shape: "tag",
});

export function TrendStatusBadge({ status }: { status: TrendStatus }) {
  return <TrendStatusBadgeBase value={status} />;
}

export function TrendPriorityBadge({ priority }: { priority: TrendPriority }) {
  return <TrendPriorityBadgeBase value={priority} />;
}
