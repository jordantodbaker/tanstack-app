import * as React from "react";
import { qk } from "~/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
