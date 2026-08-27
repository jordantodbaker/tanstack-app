import * as React from "react";
import { qk } from "~/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Lock,
  LockOpen,
  MoreVertical,
  Pencil,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import {
  createVersion,
  deleteVersion,
  updateVersion,
  versionsQueryOptions,
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Labeled } from "~/components/ui/form-helpers";

/** Display label for a version: "v3" or "v3 — as-bid". */
export function versionLabel(v: EstimateVersionOption): string {
  return v.name.trim() ? `v${v.versionNumber} — ${v.name}` : `v${v.versionNumber}`;
}

/**
 * Estimate-version picker — sits next to the project selector. Selecting a
 * version drives the whole estimate (each version has its own line items). The
 * "＋" button creates a new version (copying the current one by default); the
 * kebab menu renames or deletes the selected version.
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          title="New version"
          className="h-8 w-8"
        >
          <Plus className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              New estimate version
            </h2>
            <p className="text-xs text-slate-500">
              Creates the next version for this project. Existing versions are
              left untouched.
            </p>
          </div>
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
                <span className="font-medium">
                  {versionLabel(sourceVersion)}
                </span>
              </span>
            </label>
          )}
          {create.isError && (
            <p className="text-xs text-red-600">
              {create.error instanceof Error
                ? create.error.message
                : "Could not create version."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={create.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create version"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionActionsMenu({
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
        <RenameVersionItem version={version} onDone={() => setMenuOpen(false)} />
        <RefreshRatesItem version={version} onDone={() => setMenuOpen(false)} />
        <FreezeRatesItem version={version} onDone={() => setMenuOpen(false)} />
        {isAdmin && (
          <DeleteVersionItem
            version={version}
            totalVersions={totalVersions}
            onDone={() => setMenuOpen(false)}
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
        >
          {isFrozen ? (
            <LockOpen className="size-3.5" />
          ) : (
            <Lock className="size-3.5" />
          )}
          {isFrozen ? "Release rates…" : "Freeze rates…"}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              {isFrozen
                ? `Release v${version.versionNumber} back to live rates?`
                : `Freeze rates on v${version.versionNumber}?`}
            </h2>
            <p className="text-xs text-slate-500">
              {isFrozen ? (
                <>
                  This discards the rates frozen on{" "}
                  {fmtDate(version.ratesFrozenAt)} and returns the revision
                  to the project&apos;s current rates. Any per-revision rate
                  overrides are discarded with them. This can&apos;t be undone.
                </>
              ) : (
                <>
                  Copies the rates this revision prices at right now onto the
                  revision itself, so later changes to the global or project
                  rate book can&apos;t reach it. Existing line items already
                  store their own rate and are unaffected — this governs new
                  lines and any re-picked role, schedule or crew mix.
                </>
              )}
            </p>
          </div>
          {active.isError && (
            <p className="text-xs text-red-600">
              {active.error instanceof Error
                ? active.error.message
                : "Could not update rate freeze."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={active.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={isFrozen ? "destructive" : "default"}
              onClick={() => active.mutate()}
              disabled={active.isPending}
            >
              {active.isPending
                ? isFrozen
                  ? "Releasing…"
                  : "Freezing…"
                : isFrozen
                  ? "Release rates"
                  : "Freeze rates"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
        >
          <RefreshCw className="size-3.5" />
          Refresh rates…
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              Refresh labor rates — v{version.versionNumber}
            </h2>
            <p className="text-xs text-slate-500">
              Re-stamps every line item in this revision with the rate its role,
              schedule or crew mix resolves to now. Rows whose rate no longer
              resolves at all are left untouched.
            </p>
          </div>

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

          {apply.isError && (
            <p className="text-xs text-red-600">
              {apply.error instanceof Error
                ? apply.error.message
                : "Could not refresh rates."}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={apply.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => apply.mutate()}
              disabled={apply.isPending || isLoading || !plan || plan.rowCount === 0}
            >
              {apply.isPending
                ? "Updating…"
                : plan && plan.rowCount > 0
                  ? `Update ${plan.rowCount} row${plan.rowCount === 1 ? "" : "s"}`
                  : "Update"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
        >
          <Pencil className="size-3.5 text-slate-400" />
          Rename…
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              Rename v{version.versionNumber}
            </h2>
          </div>
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
          {save.isError && (
            <p className="text-xs text-red-600">
              {save.error instanceof Error
                ? save.error.message
                : "Could not rename version."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={save.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">
              Delete v{version.versionNumber}?
            </h2>
            <p className="text-xs text-slate-500">
              This permanently removes this version&apos;s line items and basis.
              Snapshots taken from it keep their own frozen copy. This can&apos;t
              be undone.
            </p>
          </div>
          {remove.isError && (
            <p className="text-xs text-red-600">
              {remove.error instanceof Error
                ? remove.error.message
                : "Could not delete version."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={remove.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete version"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
