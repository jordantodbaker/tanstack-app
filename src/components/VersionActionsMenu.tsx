import * as React from "react";
import { qk } from "~/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Lock,
  LockOpen,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import {
  deleteVersion,
  updateVersion,
  type EstimateVersionOption,
} from "~/utils/versions";
import { useIsAdmin } from "~/lib/use-current-user";
import {
  freezeVersionRates,
  invalidateRateFreezeQueries,
  unfreezeVersionRates,
} from "~/utils/rateFreeze";
import { fmtDate } from "~/lib/csv-export";
import { formatMoney } from "~/lib/formatting";
import {
  applyVersionRateRefresh,
  invalidateRateRefreshQueries,
  versionRateRefreshQueryOptions,
} from "~/utils/rateRefresh";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Labeled } from "~/components/ui/form-helpers";
import { MutationDialog } from "~/components/MutationDialog";

/** A row in the actions menu that opens its dialog. */
const MENU_ITEM =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100";

/**
 * The kebab menu beside the version picker: rename, refresh rates,
 * freeze / release rates and (admins) delete the selected version.
 */
export function VersionActionsMenu({
  version,
  totalVersions,
}: {
  version: EstimateVersionOption;
  totalVersions: number;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Deleting a revision is destructive and irreversible — admins only. The
  // server enforces this too (deleteVersion → requireAdmin); this just hides
  // the affordance for non-admins.
  const isAdmin = useIsAdmin();
  const done = () => setMenuOpen(false);
  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Version actions"
          className="h-8 w-8"
        >
          <MoreVertical className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1">
        <RenameVersionItem version={version} onDone={done} />
        <RefreshRatesItem version={version} onDone={done} />
        <FreezeRatesItem version={version} onDone={done} />
        {isAdmin && (
          <DeleteVersionItem
            version={version}
            totalVersions={totalVersions}
            onDone={done}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Freeze / release this revision's labor rates.
 *
 * Freezing materializes the rate book the grid currently resolves, so later
 * global or project rate changes can't reach an issued revision. Releasing is
 * admin-only and destructive (it discards the frozen rows), so the two states
 * render as different affordances rather than one toggle.
 */
function FreezeRatesItem({
  version,
  onDone,
}: {
  version: EstimateVersionOption;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();
  const [open, setOpen] = React.useState(false);
  const isAdmin = useIsAdmin();
  const isFrozen = version.ratesFrozenAt !== null;

  const settle = () => {
    invalidateRateFreezeQueries(queryClient, projectId);
    setOpen(false);
    onDone();
  };
  const freeze = useMutation({
    mutationFn: () => freezeVersionRates({ data: { versionId: version.id } }),
    onSuccess: settle,
  });
  const release = useMutation({
    mutationFn: () => unfreezeVersionRates({ data: { versionId: version.id } }),
    onSuccess: settle,
  });
  const active = isFrozen ? release : freeze;

  // Releasing is admin-only (the server enforces it too); a non-admin looking
  // at a frozen revision gets no action rather than one that will be refused.
  if (isFrozen && !isAdmin) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-400">
        <Lock className="size-3.5" />
        Rates frozen
      </div>
    );
  }

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={MENU_ITEM}>
          {isFrozen ? (
            <LockOpen className="size-3.5" />
          ) : (
            <Lock className="size-3.5" />
          )}
          {isFrozen ? "Release rates…" : "Freeze rates…"}
        </button>
      }
      title={
        isFrozen
          ? `Release v${version.versionNumber} back to live rates?`
          : `Freeze rates on v${version.versionNumber}?`
      }
      description={
        isFrozen ? (
          <>
            This discards the rates frozen on {fmtDate(version.ratesFrozenAt)}{" "}
            and returns the revision to the project&apos;s current rates. Any
            per-revision rate overrides are discarded with them. This
            can&apos;t be undone.
          </>
        ) : (
          <>
            Copies the rates this revision prices at right now onto the
            revision itself, so later changes to the global or project rate
            book can&apos;t reach it. Existing line items already store their
            own rate and are unaffected — this governs new lines and any
            re-picked role, schedule or crew mix.
          </>
        )
      }
      onConfirm={() => active.mutate()}
      pending={active.isPending}
      error={active.error}
      errorFallback="Could not update rate freeze."
      confirmLabel={isFrozen ? "Release rates" : "Freeze rates"}
      pendingLabel={isFrozen ? "Releasing…" : "Freezing…"}
      confirmVariant={isFrozen ? "destructive" : "default"}
    />
  );
}

/**
 * Refresh this revision's stored labor rates.
 *
 * Line items carry the rate that was in force when they were estimated, so
 * correcting the rate book leaves them behind. This shows exactly which rows
 * drifted and what it costs before writing anything — nothing is repriced
 * without someone approving the list.
 *
 * The preview is fetched fresh each time the dialog opens (never cached), and
 * the server re-plans before writing, so an approved plan can't be applied
 * against a sheet that moved underneath it.
 */
function RefreshRatesItem({
  version,
  onDone,
}: {
  version: EstimateVersionOption;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: plan, isLoading } = useQuery({
    ...versionRateRefreshQueryOptions(version.id),
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: () => applyVersionRateRefresh({ data: { versionId: version.id } }),
    onSuccess: () => {
      invalidateRateRefreshQueries(queryClient, version.id);
      setOpen(false);
      onDone();
    },
  });

  const nothingToDo = plan !== undefined && plan.rowCount === 0;

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-lg"
      trigger={
        <button type="button" className={MENU_ITEM}>
          <RefreshCw className="size-3.5" />
          Refresh rates…
        </button>
      }
      title={`Refresh labor rates — v${version.versionNumber}`}
      description="Re-stamps every line item in this revision with the rate its role, schedule or crew mix resolves to now. Rows whose rate no longer resolves at all are left untouched."
      onConfirm={() => apply.mutate()}
      pending={apply.isPending}
      error={apply.error}
      errorFallback="Could not refresh rates."
      confirmLabel={
        plan && plan.rowCount > 0
          ? `Update ${plan.rowCount} row${plan.rowCount === 1 ? "" : "s"}`
          : "Update"
      }
      pendingLabel="Updating…"
      confirmDisabled={isLoading || !plan || plan.rowCount === 0}
    >
      {isLoading && (
        <p className="text-sm text-slate-500">Checking line items…</p>
      )}

      {nothingToDo && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Every line item already matches the current rates
          {version.ratesFrozenAt
            ? " — this revision's rates are frozen, so they resolve to the frozen book."
            : "."}
        </p>
      )}

      {plan && plan.rowCount > 0 && (
        <>
          <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Rate source</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Stored</th>
                  <th className="px-2 py-1.5 text-right font-semibold">New</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Rows</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Labor cost</th>
                </tr>
              </thead>
              <tbody>
                {plan.changes.map((c) => (
                  <tr key={`${c.label}|${c.storedRate}`} className="border-t border-slate-200">
                    <td className="px-2 py-1.5">{c.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                      {c.storedRate === "" ? "—" : c.storedRate}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {c.newRate}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {c.rowIds.length}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${
                        c.laborCostDelta > 0
                          ? "text-red-600"
                          : c.laborCostDelta < 0
                            ? "text-emerald-700"
                            : "text-slate-500"
                      }`}
                    >
                      {c.laborCostDelta >= 0 ? "+" : "−"}$
                      {formatMoney(Math.abs(c.laborCostDelta))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            {plan.rowCount} line item{plan.rowCount === 1 ? "" : "s"} across
            every discipline in this revision. Net labor cost impact{" "}
            <span className="font-semibold text-slate-700">
              {plan.totalDelta >= 0 ? "+" : "−"}$
              {formatMoney(Math.abs(plan.totalDelta))}
            </span>
            .
          </p>
        </>
      )}
    </MutationDialog>
  );
}

function RenameVersionItem({
  version,
  onDone,
}: {
  version: EstimateVersionOption;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(version.name);
  const [description, setDescription] = React.useState(version.description);

  React.useEffect(() => {
    if (open) {
      setName(version.name);
      setDescription(version.description);
    }
  }, [open, version.name, version.description]);

  const save = useMutation({
    mutationFn: () =>
      updateVersion({ data: { versionId: version.id, name, description } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.versions(projectId) });
      setOpen(false);
      onDone();
    },
  });

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={`${MENU_ITEM} text-slate-700`}>
          <Pencil className="size-3.5 text-slate-400" />
          Rename…
        </button>
      }
      title={`Rename v${version.versionNumber}`}
      onConfirm={() => save.mutate()}
      pending={save.isPending}
      error={save.error}
      errorFallback="Could not rename version."
      confirmLabel="Save"
    >
      <Labeled label="Name" help="Shown next to the version number.">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="as-bid"
          maxLength={120}
        />
      </Labeled>
      <Labeled label="Description" help="Optional context for this version.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
        />
      </Labeled>
    </MutationDialog>
  );
}

function DeleteVersionItem({
  version,
  totalVersions,
  onDone,
}: {
  version: EstimateVersionOption;
  totalVersions: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { projectId } = useSelectedProject();
  const { setVersionId } = useSelectedVersion();
  const [open, setOpen] = React.useState(false);
  const isLast = totalVersions <= 1;

  const remove = useMutation({
    mutationFn: () => deleteVersion({ data: { versionId: version.id } }),
    onSuccess: () => {
      // Clear selection; SelectedVersionProvider re-resolves to another version
      // once the refreshed list loads.
      setVersionId(null);
      queryClient.invalidateQueries({ queryKey: qk.versions(projectId) });
      setOpen(false);
      onDone();
    },
  });

  return (
    <MutationDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          disabled={isLast}
          title={
            isLast ? "A project must keep at least one version" : undefined
          }
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          <Trash2 className="size-3.5" />
          Delete…
        </button>
      }
      title={`Delete v${version.versionNumber}?`}
      description={
        <>
          This permanently removes this version&apos;s line items and basis.
          Snapshots taken from it keep their own frozen copy. This can&apos;t
          be undone.
        </>
      }
      onConfirm={() => remove.mutate()}
      pending={remove.isPending}
      error={remove.error}
      errorFallback="Could not delete version."
      confirmLabel="Delete version"
      pendingLabel="Deleting…"
      confirmVariant="destructive"
    />
  );
}
