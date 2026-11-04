import { toggleInSet } from "~/lib/utils";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, RotateCcw } from "lucide-react";

// The drag-and-drop list and its dnd-kit dependencies load on the first open:
// the dialog's content mounts only while open, so nothing is fetched before.
const DashboardCustomizeList = React.lazy(() =>
  import("./DashboardCustomizeList").then((m) => ({
    default: m.DashboardCustomizeList,
  })),
);
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DASHBOARD_WIDGETS,
  orderedWidgets,
  type DashboardWidget,
} from "~/config/dashboard-widgets";
import {
  updateUserDashboardPrefs,
  userDashboardPrefsQueryOptions,
  type DashboardPrefs,
} from "~/utils/userPreferences";

/**
 * Reorder + show/hide widgets, both in a single sortable list. Drag the grip
 * handle on the left to reorder; click the eye on the right to toggle
 * visibility (a hidden widget stays in the list so the user can re-show or
 * move it without losing its place). Bulk save (Cancel/Save buttons) rather
 * than per-toggle auto-save so a user can preview a layout and bail out.
 *
 * The dialog initializes from `currentPrefs.widgetOrder`, falling back to the
 * catalog order when the user has no saved order yet — `orderedWidgets`
 * handles both cases and additionally pads newly-introduced catalog widgets
 * onto the end of the user's order.
 */
export function DashboardCustomizeDialog({
  currentPrefs,
}: {
  currentPrefs: DashboardPrefs;
}) {
  const [open, setOpen] = React.useState(false);

  // Draft state — reseeded each time the dialog opens so closing without
  // saving discards in-flight toggles and drags.
  const [draftOrder, setDraftOrder] = React.useState<string[]>(() =>
    orderedWidgets(currentPrefs.widgetOrder).map((w) => w.id),
  );
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(currentPrefs.hiddenWidgets),
  );
  React.useEffect(() => {
    if (open) {
      setDraftOrder(orderedWidgets(currentPrefs.widgetOrder).map((w) => w.id));
      setHidden(new Set(currentPrefs.hiddenWidgets));
    }
  }, [open, currentPrefs.hiddenWidgets, currentPrefs.widgetOrder]);

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (next: { hiddenWidgets: string[]; widgetOrder: string[] }) =>
      updateUserDashboardPrefs({ data: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userDashboardPrefsQueryOptions().queryKey,
      });
      setOpen(false);
    },
  });

  const toggleVisible = (id: string) => {
    setHidden((prev) => toggleInSet(prev, id));
  };

  function resetDefaults() {
    setDraftOrder(DASHBOARD_WIDGETS.map((w) => w.id));
    setHidden(new Set());
  }

  const visibleCount = DASHBOARD_WIDGETS.length - hidden.size;
  const dirty =
    !sameContents(hidden, new Set(currentPrefs.hiddenWidgets)) ||
    !sameOrder(
      draftOrder,
      orderedWidgets(currentPrefs.widgetOrder).map((w) => w.id),
    );

  // Map id → widget for fast lookup in the row renderer.
  const widgetById = React.useMemo(() => {
    const m = new Map<string, DashboardWidget>();
    for (const w of DASHBOARD_WIDGETS) m.set(w.id, w);
    return m;
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Customize dashboard"
          aria-label="Customize dashboard"
        >
          <Settings className="size-3.5 mr-1.5" />
          Customize
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,560px)] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div>
            <DialogTitle className="text-lg font-semibold text-slate-800">
              Customize dashboard
            </DialogTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Drag widgets to reorder. Click the eye icon to hide one without
              removing it from the list. Saved per user; applies to every
              project.
            </p>
          </div>

          <React.Suspense
            fallback={<p className="text-xs text-slate-500">Loading…</p>}
          >
            <DashboardCustomizeList
              order={draftOrder}
              hidden={hidden}
              widgetById={widgetById}
              onReorder={setDraftOrder}
              onToggle={toggleVisible}
            />
          </React.Suspense>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={resetDefaults}
              disabled={save.isPending}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              <RotateCcw className="size-3" />
              Reset to defaults
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                {visibleCount} of {DASHBOARD_WIDGETS.length} visible
              </span>
              <DialogClose asChild>
                <Button
                  variant="outline"
                  type="button"
                  disabled={save.isPending}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                onClick={() =>
                  save.mutate({
                    hiddenWidgets: Array.from(hidden),
                    widgetOrder: draftOrder,
                  })
                }
                disabled={save.isPending || !dirty}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function sameContents(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
