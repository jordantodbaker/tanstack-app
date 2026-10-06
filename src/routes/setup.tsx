import { createFileRoute, redirect } from "@tanstack/react-router";
import { qk } from "~/lib/query-keys";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Settings } from "lucide-react";
import {
  CBS_HEADER_COLOR,
  CBS_LEGEND_LEVELS,
  cbsColorForLevel,
} from "~/config/cbs-level-colors";
import { LoadMask } from "~/components/LoadMask";
import {
  setupCbsItemsQueryOptions,
  allowedFefCbsItemIdsQueryOptions,
  updateAllowedFefCbsItems,
} from "~/utils/setup";
import { currentUserQueryOptions, hasAtLeastRole } from "~/utils/users";
import {
  buildCbsTree,
  filterCbsTree,
  getNodeSelectionState,
  rowTypeBadge,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ProjectSelect } from "~/components/ProjectSelect";
import { useSelectedProject } from "~/lib/selected-project";
import { logger } from "~/lib/logger";

export const Route = createFileRoute("/setup")({
  // Setup configures project-level allow-lists — admin-only. Non-admins are
  // redirected away rather than seeing a forbidden error.
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (!user || !hasAtLeastRole(user.role, "ADMINISTRATOR")) {
      throw redirect({ to: "/changelog" });
    }
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(setupCbsItemsQueryOptions()),
  component: SetupPage,
});

function SetupPage() {
  const { data: items = [] } = useQuery(setupCbsItemsQueryOptions());
  const { projectId } = useSelectedProject();
  const tree = React.useMemo(() => buildCbsTree(items), [items]);

  return (
    <main className="p-4 max-w-5xl">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Settings className="size-7" />
        Setup
      </h1>

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="setup-project" className="text-sm font-medium">
          Project:
        </label>
        <ProjectSelect id="setup-project" />
      </div>

      {projectId === null ? (
        <p className="text-sm text-slate-500">
          Choose a project to configure which CBS items are allowed in the
          Field Estimate Form.
        </p>
      ) : (
        <CbsTreeEditorLoader
          key={projectId}
          projectId={projectId}
          tree={tree}
        />
      )}
    </main>
  );
}

function CbsTreeEditorLoader({
  projectId,
  tree,
}: {
  projectId: number;
  tree: CbsTreeNode[];
}) {
  const allowedQuery = useQuery(allowedFefCbsItemIdsQueryOptions(projectId));
  if (allowedQuery.isPending) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }
  if (allowedQuery.isError) {
    return (
      <div className="text-sm text-red-600">
        Failed to load allowed items.
      </div>
    );
  }
  return (
    <CbsTreeEditor
      projectId={projectId}
      tree={tree}
      initialAllowedIds={allowedQuery.data ?? []}
    />
  );
}

function CbsTreeEditor({
  projectId,
  tree,
  initialAllowedIds,
}: {
  projectId: number;
  tree: CbsTreeNode[];
  initialAllowedIds: number[];
}) {
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(
    () => new Set(initialAllowedIds),
  );
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const isFiltering = search !== deferredSearch;

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (vars: { addIds: number[]; removeIds: number[] }) =>
      updateAllowedFefCbsItems({
        data: { projectId, addIds: vars.addIds, removeIds: vars.removeIds },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cbs.itemsByL1PagedAll() });
      queryClient.invalidateQueries({ queryKey: qk.cbs.itemsByL1FilteredAll() });
      queryClient.invalidateQueries({
        queryKey: qk.setup.allowedFefCbsItemIds(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.setup.allowedCbsL1Codes(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.cbs.projectDictionary(projectId),
      });
    },
    onError: (err, vars) => {
      logger.error("setup updateAllowedFefCbsItems failed", { err, vars });
    },
  });

  const filteredTree = React.useMemo(
    () => filterCbsTree(tree, deferredSearch.trim().toLowerCase()),
    [tree, deferredSearch],
  );

  const allPathKeys = React.useMemo(() => {
    const keys: string[] = [];
    function walk(nodes: CbsTreeNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          keys.push(n.pathKey);
          walk(n.children);
        }
      }
    }
    walk(tree);
    return keys;
  }, [tree]);

  const isSearching = deferredSearch.trim().length > 0;
  const totalSelected = selectedIds.size;

  const toggleExpand = React.useCallback((pathKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  // Compute the delta inside the setSelectedIds updater so we always read
  // the latest *queued* selection, not a render-stale ref. With a ref,
  // rapid back-to-back clicks would diff against the previous render's
  // selection and send mutations that don't match the UI.
  const { mutate } = mutation;
  const toggleNode = React.useCallback(
    (node: CbsTreeNode) => {
      let addIds: number[] = [];
      let removeIds: number[] = [];
      setSelectedIds((prev) => {
        const state = getNodeSelectionState(node, prev);
        const ids = node.descendantItemIds;
        if (state === "checked") {
          removeIds = ids.filter((id) => prev.has(id));
          if (removeIds.length === 0) return prev;
          const next = new Set(prev);
          for (const id of removeIds) next.delete(id);
          return next;
        }
        addIds = ids.filter((id) => !prev.has(id));
        if (addIds.length === 0) return prev;
        const next = new Set(prev);
        for (const id of addIds) next.add(id);
        return next;
      });
      if (addIds.length === 0 && removeIds.length === 0) return;
      mutate({ addIds, removeIds });
    },
    [mutate],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search by code, name, or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(new Set(allPathKeys))}
        >
          Expand all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(new Set())}
        >
          Collapse all
        </Button>
        <span className="ml-auto text-sm text-slate-600">
          {totalSelected.toLocaleString()} selected
          {mutation.isPending && (
            <span className="ml-2 text-slate-400">saving…</span>
          )}
          {mutation.isError && (
            <span className="ml-2 text-red-600">save failed</span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <span className="mr-1">Level colours:</span>
        {CBS_LEGEND_LEVELS.map((lvl) => {
          const c = cbsColorForLevel(lvl);
          return (
            <span
              key={lvl}
              title={`Level ${lvl}`}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: c.fill,
                color: c.text,
                outline: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              L{lvl}
            </span>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
          style={{
            backgroundColor: CBS_HEADER_COLOR.fill,
            color: CBS_HEADER_COLOR.text,
          }}
        >
          CBS code &amp; name
          <span className="ml-auto opacity-80">UOM</span>
        </div>
        {isFiltering && <LoadMask label="Filtering…" size="sm" rounded />}
        {filteredTree.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No matches.</div>
        ) : (
          <ul role="tree">
            {filteredTree.map((node) => (
              <TreeRow
                key={node.pathKey}
                node={node}
                depth={0}
                selectedIds={selectedIds}
                expanded={expanded}
                isSearching={isSearching}
                onToggleExpand={toggleExpand}
                onToggleSelect={toggleNode}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type TreeRowProps = {
  node: CbsTreeNode;
  depth: number;
  selectedIds: Set<number>;
  expanded: Set<string>;
  /** When true, every node with children is treated as open without
   *  needing to live in `expanded`. */
  isSearching: boolean;
  onToggleExpand: (pathKey: string) => void;
  onToggleSelect: (node: CbsTreeNode) => void;
};

const TreeRow = React.memo(function TreeRow({
  node,
  depth,
  selectedIds,
  expanded,
  isSearching,
  onToggleExpand,
  onToggleSelect,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen =
    (isSearching && hasChildren) || expanded.has(node.pathKey);
  const state = getNodeSelectionState(node, selectedIds);
  const item = node.item;
  const label = item.name || item.accountDescription || item.displayCode;
  const code = item.displayCode;
  const badge = rowTypeBadge(item.rowType);

  // Same colour-by-code-level scheme as the Project CBS page.
  const color = cbsColorForLevel(node.level);

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className="flex items-center gap-2 border-b border-black/5 py-1 pr-3 text-sm transition-[filter] hover:brightness-95"
        style={{
          backgroundColor: color.fill,
          color: color.text,
          paddingLeft: depth * 18 + 8,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.pathKey)}
            className="grid size-4 shrink-0 place-items-center rounded hover:bg-black/10"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight
              size={13}
              className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="size-4 shrink-0 text-center opacity-40">·</span>
        )}
        <Checkbox
          checked={
            state === "indeterminate" ? "indeterminate" : state === "checked"
          }
          onCheckedChange={() => onToggleSelect(node)}
          aria-label={`Toggle ${label}`}
          className="border-current/50 bg-white/80"
        />
        <span className="shrink-0 font-mono text-xs tabular-nums opacity-80">
          {code}
        </span>
        <span className="truncate font-medium">{label}</span>
        {badge && (
          <span
            title={badge.title}
            className="shrink-0 rounded border border-current/30 px-1 text-[10px] leading-4 font-semibold opacity-70"
          >
            {badge.label}
          </span>
        )}
        {item.uom && (
          <span className="ml-auto shrink-0 font-mono text-[11px] opacity-70">
            {item.uom}
          </span>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.pathKey}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expanded={expanded}
              isSearching={isSearching}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
});
