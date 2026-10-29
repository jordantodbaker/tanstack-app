import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { qk } from "~/lib/query-keys";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Labeled,
  NativeSelect,
  fromDateInputValue,
  toDateInputValue,
} from "~/components/ui/form-helpers";
import { MutationDialog } from "~/components/MutationDialog";
import { createReportingPeriod } from "~/utils/reporting";
import { snapshotsQueryOptions } from "~/utils/snapshots";
import { formatShortDate } from "~/lib/dates";

/**
 * Opens a reporting period: a label, a data date and the baseline snapshot
 * its earned value is measured against. The newest snapshot is picked by
 * default.
 */
export function NewPeriodDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [dataDate, setDataDate] = React.useState(
    toDateInputValue(new Date().toISOString()),
  );
  const [snapshotId, setSnapshotId] = React.useState<string>("");
  const queryClient = useQueryClient();
  const { data: snapshots = [] } = useQuery({
    ...snapshotsQueryOptions(projectId),
    enabled: open,
  });

  // Default the snapshot select to the latest one once the list arrives.
  React.useEffect(() => {
    if (open && snapshotId === "" && snapshots.length > 0) {
      setSnapshotId(String(snapshots[0].id));
    }
  }, [open, snapshots, snapshotId]);

  const create = useMutation({
    mutationFn: () => {
      const iso = fromDateInputValue(dataDate);
      if (!iso) throw new Error("Pick a data date.");
      if (!snapshotId) throw new Error("Pick a baseline snapshot.");
      return createReportingPeriod({
        data: {
          projectId,
          label: label.trim(),
          dataDate: iso,
          baselineSnapshotId: Number(snapshotId),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.reporting.periods(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.reporting.evmTimeSeries(projectId),
      });
      setOpen(false);
      setLabel("");
      setDataDate(toDateInputValue(new Date().toISOString()));
    },
  });

  const canSubmit = label.trim() !== "" && dataDate !== "" && snapshotId !== "";

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm">
          <Plus className="size-3.5 mr-1" />
          New Period
        </Button>
      }
      title="New Reporting Period"
      description="Locks a baseline snapshot to a data date so EVM math stays consistent across this period's measurements."
      onConfirm={() => create.mutate()}
      pending={create.isPending}
      error={create.error}
      errorFallback="Could not create period."
      confirmLabel="Create"
      confirmDisabled={!canSubmit || snapshots.length === 0}
    >
      <Labeled label="Label" help='e.g. "April 2026" or "WE 2026-04-15"'>
        <Input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="April 2026"
          maxLength={120}
        />
      </Labeled>
      <Labeled label="Data date">
        <Input
          type="date"
          value={dataDate}
          onChange={(e) => setDataDate(e.target.value)}
        />
      </Labeled>
      <Labeled label="Baseline snapshot">
        {snapshots.length === 0 ? (
          <p className="text-xs text-slate-500">
            No snapshots on this project yet. Create one from the Summary
            page first.
          </p>
        ) : (
          <NativeSelect
            value={snapshotId}
            onChange={setSnapshotId}
            options={snapshots.map((s) => ({
              value: String(s.id),
              label: `${s.label} (${formatShortDate(s.createdAt)})`,
            }))}
          />
        )}
      </Labeled>
    </MutationDialog>
  );
}
