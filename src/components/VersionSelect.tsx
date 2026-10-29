import * as React from "react";
import { qk } from "~/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Lock, Plus } from "lucide-react";
import { cn } from "~/lib/utils";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import {
  createVersion,
  versionsQueryOptions,
  type EstimateVersionOption,
} from "~/utils/versions";
import { fmtDate } from "~/lib/csv-export";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Labeled } from "~/components/ui/form-helpers";
import { MutationDialog } from "~/components/MutationDialog";
import { VersionActionsMenu } from "~/components/VersionActionsMenu";

/** Display label for a version: "v3" or "v3 — as-bid". */
function versionLabel(v: EstimateVersionOption): string {
  return v.name.trim() ? `v${v.versionNumber} — ${v.name}` : `v${v.versionNumber}`;
}

/**
 * Estimate-version picker — sits next to the project selector. Selecting a
 * version drives the whole estimate (each version has its own line items). The
 * "＋" button creates a new version (copying the current one by default); the
 * kebab menu (`VersionActionsMenu`) holds the rest of the version actions.
 */
export function VersionSelect({ className }: { className?: string }) {
  const { projectId } = useSelectedProject();
  const { versionId, setVersionId } = useSelectedVersion();
  const { data: versions = [] } = useQuery(versionsQueryOptions(projectId));

  const selected = versions.find((v) => v.id === versionId) ?? null;

  if (projectId === null) {
    return (
      <select
        disabled
        className={cn(
          "h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-400",
          className,
        )}
      >
        <option>Version…</option>
      </select>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Estimate version"
        value={versionId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setVersionId(v ? Number(v) : null);
        }}
        className={cn(
          "h-8 rounded-md border border-input bg-white px-2 text-sm",
          className,
        )}
      >
        {versions.length === 0 && <option value="">Loading…</option>}
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {versionLabel(v)}
          </option>
        ))}
      </select>
      {selected?.ratesFrozenAt && (
        // Rates being frozen changes what new lines price at, so it needs to be
        // visible while working the sheet — not only inside the actions menu.
        <span
          title={`Labor rates frozen on ${fmtDate(selected.ratesFrozenAt)} — new lines price at the rates as of that date.`}
          className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700"
        >
          <Lock className="size-3" />
          Rates frozen
        </span>
      )}
      <NewVersionDialog projectId={projectId} sourceVersion={selected} />
      {selected && (
        <VersionActionsMenu version={selected} totalVersions={versions.length} />
      )}
    </div>
  );
}

function NewVersionDialog({
  projectId,
  sourceVersion,
}: {
  projectId: number;
  sourceVersion: EstimateVersionOption | null;
}) {
  const queryClient = useQueryClient();
  const { setVersionId } = useSelectedVersion();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [copyFromCurrent, setCopyFromCurrent] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      setName("");
      setCopyFromCurrent(true);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      createVersion({
        data: {
          projectId,
          name: name.trim() || undefined,
          sourceVersionId:
            copyFromCurrent && sourceVersion ? sourceVersion.id : undefined,
        },
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: qk.versions(projectId) });
      // Drop any cached estimate data so the new version's sheets, totals, and
      // badges refetch fresh instead of briefly showing a stale/empty view of
      // the version we just switched away from. Keyed broadly (prefix match) so
      // every discipline/section and both totals queries are covered.
      queryClient.invalidateQueries({ queryKey: qk.fefRows.all() });
      queryClient.invalidateQueries({ queryKey: qk.projectFefRowTotalsAll() });
      queryClient.invalidateQueries({ queryKey: qk.invalidByDisciplineAll() });
      queryClient.invalidateQueries({ queryKey: qk.basisInputs.all() });
      // Jump to the freshly created version.
      setVersionId(created.id);
      setOpen(false);
    },
  });

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="outline"
          size="icon-sm"
          title="New version"
          className="h-8 w-8"
        >
          <Plus className="size-4" />
        </Button>
      }
      title="New estimate version"
      description="Creates the next version for this project. Existing versions are left untouched."
      onConfirm={() => create.mutate()}
      pending={create.isPending}
      error={create.error}
      errorFallback="Could not create version."
      confirmLabel="Create version"
      pendingLabel="Creating…"
    >
      <Labeled
        label="Name"
        help="Optional. Shown next to the version number (e.g. “as-bid”)."
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="as-bid"
          maxLength={120}
        />
      </Labeled>
      {sourceVersion && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={copyFromCurrent}
            onChange={(e) => setCopyFromCurrent(e.target.checked)}
            className="mt-0.5"
          />
          <span className="flex items-center gap-1">
            <Copy className="size-3.5 text-slate-400" />
            Copy line items &amp; basis from{" "}
            <span className="font-medium">{versionLabel(sourceVersion)}</span>
          </span>
        </label>
      )}
    </MutationDialog>
  );
}
