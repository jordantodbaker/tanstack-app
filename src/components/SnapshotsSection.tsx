import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Camera, Pencil, Trash2 } from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import {
  createSnapshot,
  deleteSnapshot,
  snapshotsQueryOptions,
  updateSnapshot,
  type EstimateSnapshotItem,
} from "~/utils/snapshots";
import { qk } from "~/lib/query-keys";
import { formatDateTime } from "~/lib/dates";
import { useCurrentUser, useIsAdmin } from "~/lib/use-current-user";
import { QueryError } from "~/components/ui/list-page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Labeled } from "~/components/ui/form-helpers";
import { MutationDialog } from "~/components/MutationDialog";
import { SnapshotDetailDialog } from "~/components/SnapshotDetailDialog";

/**
 * "Snapshots" panel for the Summary page. Lists frozen estimate captures for
 * the current project, lets the user create new ones, view their totals, and
 * delete their own.
 */
export function SnapshotsSection() {
  const { projectId } = useSelectedProject();
  const {
    data: snapshots = [],
    isPending,
    isError,
    error,
  } = useQuery(snapshotsQueryOptions(projectId));

  if (projectId === null) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Camera className="size-5 text-slate-500" />
            Snapshots
          </h2>
          <p className="text-xs text-slate-500">
            Freeze the current estimate (FEF rows + Basis) at a point in time
            for later comparison. Inputs are frozen; totals are recomputed on
            view from the same aggregator the live Summary uses.
          </p>
        </div>
        <CreateSnapshotDialog projectId={projectId} />
      </div>
      {isError ? (
        <QueryError error={error} label="snapshots" />
      ) : isPending ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : snapshots.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          No snapshots yet. Click <span className="font-medium">Create
          snapshot</span> to capture the current estimate.
        </p>
      ) : (
        <SnapshotList snapshots={snapshots} />
      )}
    </section>
  );
}

function SnapshotList({
  snapshots,
}: {
  snapshots: EstimateSnapshotItem[];
}) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Label</th>
            <th className="px-3 py-2 text-left">Notes</th>
            <th className="px-3 py-2 text-right">Rows</th>
            <th className="px-3 py-2 text-left">Created by</th>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <SnapshotRow key={s.id} snapshot={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotRow({
  snapshot,
}: {
  snapshot: EstimateSnapshotItem;
}) {
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = useIsAdmin();
  const isCreator = currentUser?.email === snapshot.createdByEmail;
  const canManage = isAdmin || isCreator;

  const remove = useMutation({
    mutationFn: (id: number) => deleteSnapshot({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.snapshots(projectId) });
      // The deleted snapshot may have been the budget view's latest baseline.
      queryClient.invalidateQueries({
        queryKey: qk.reporting.budgetReconciliationAll(projectId),
      });
    },
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete snapshot "${snapshot.label}"? This can't be undone.`)) {
      return;
    }
    remove.mutate(snapshot.id);
  }

  return (
    <SnapshotDetailDialog snapshotId={snapshot.id}>
      <tr className="cursor-pointer hover:bg-slate-50 border-t border-slate-100">
        <td className="px-3 py-2 font-medium text-slate-800">
          {snapshot.label}
        </td>
        <td className="px-3 py-2 text-slate-600 truncate max-w-xs">
          {snapshot.notes || "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
          {snapshot.rowCount}
        </td>
        <td className="px-3 py-2 text-slate-600">
          {snapshot.createdByEmail ?? "—"}
        </td>
        <td className="px-3 py-2 text-slate-600">
          {formatDateTime(snapshot.createdAt)}
        </td>
        <td className="px-3 py-2 text-right">
          {canManage && (
            <div className="flex items-center justify-end gap-1">
              <EditSnapshotDialog snapshot={snapshot} />
              <button
                type="button"
                onClick={handleDelete}
                disabled={remove.isPending}
                title="Delete snapshot"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 inline-flex h-7 w-7 items-center justify-center rounded-md"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>
    </SnapshotDetailDialog>
  );
}

function CreateSnapshotDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const queryClient = useQueryClient();
  const { versionId } = useSelectedVersion();

  const create = useMutation({
    mutationFn: () => {
      if (versionId === null) {
        throw new Error("Select an estimate version to snapshot.");
      }
      return createSnapshot({
        data: { projectId, versionId, label: label.trim(), notes: notes.trim() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.snapshots(projectId) });
      // A new snapshot becomes the budget view's latest baseline.
      queryClient.invalidateQueries({
        queryKey: qk.reporting.budgetReconciliationAll(projectId),
      });
      setOpen(false);
      setLabel("");
      setNotes("");
    },
  });

  function handleCreate() {
    if (!label.trim() || versionId === null) return;
    create.mutate();
  }

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm">
          <Camera className="size-3.5 mr-1" />
          Create snapshot
        </Button>
      }
      title="Create snapshot"
      description="Freezes every FEF row and the project Basis as they are now. Once saved, the snapshot's inputs can't be edited."
      onConfirm={handleCreate}
      pending={create.isPending}
      error={create.error}
      errorFallback="Could not create snapshot."
      confirmLabel="Create"
      confirmDisabled={!label.trim()}
    >
      <Labeled
        label="Label"
        help='e.g. "As-bid 2026-04-15" or "Rev 2 after RFI-042"'
      >
        <Input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="As-bid"
          maxLength={120}
        />
      </Labeled>
      <Labeled
        label="Notes"
        help="Optional. Context for why this snapshot was taken."
      >
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Submitted to owner for review…"
        />
      </Labeled>
    </MutationDialog>
  );
}

function EditSnapshotDialog({ snapshot }: { snapshot: EstimateSnapshotItem }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(snapshot.label);
  const [notes, setNotes] = React.useState(snapshot.notes);
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();

  // Re-seed from the latest snapshot each time the dialog opens, so a stale
  // draft from a prior open doesn't linger.
  React.useEffect(() => {
    if (open) {
      setLabel(snapshot.label);
      setNotes(snapshot.notes);
    }
  }, [open, snapshot.label, snapshot.notes]);

  const update = useMutation({
    mutationFn: () =>
      updateSnapshot({
        data: { id: snapshot.id, label: label.trim(), notes: notes.trim() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.snapshots(projectId) });
      // Detail cache has `staleTime: Infinity`, so it must be busted explicitly
      // or a reopened detail dialog would show the old label/notes.
      queryClient.invalidateQueries({ queryKey: qk.snapshot(snapshot.id) });
      setOpen(false);
    },
  });

  function handleSave() {
    if (!label.trim()) return;
    update.mutate();
  }

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          // Stop the click bubbling to the row, which is itself the trigger for
          // the snapshot detail dialog.
          onClick={(e) => e.stopPropagation()}
          title="Edit label & notes"
          className="text-slate-500 hover:bg-slate-100 hover:text-slate-700 inline-flex h-7 w-7 items-center justify-center rounded-md"
        >
          <Pencil className="size-3.5" />
        </button>
      }
      contentProps={{ onClick: (e) => e.stopPropagation() }}
      title="Edit snapshot"
      description="Update the label and notes. The captured estimate (FEF rows + Basis) stays frozen."
      onConfirm={handleSave}
      pending={update.isPending}
      error={update.error}
      errorFallback="Could not update snapshot."
      confirmLabel="Save"
      confirmDisabled={!label.trim()}
    >
      <Labeled
        label="Label"
        help='e.g. "As-bid 2026-04-15" or "Rev 2 after RFI-042"'
      >
        <Input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="As-bid"
          maxLength={120}
        />
      </Labeled>
      <Labeled
        label="Notes"
        help="Optional. Context for why this snapshot was taken."
      >
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Submitted to owner for review…"
        />
      </Labeled>
    </MutationDialog>
  );
}
