import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Settings } from "lucide-react";
import {
  fetchSetupCbsItems,
  allowedFefCbsItemIdsQueryOptions,
  updateAllowedFefCbsItems,
} from "~/utils/setup";
import {
  buildCbsTree,
  filterCbsTree,
  getNodeSelectionState,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ProjectSelect } from "~/components/ProjectSelect";
import { useSelectedProject } from "~/lib/selected-project";

export const Route = createFileRoute("/setup")({
  loader: () => fetchSetupCbsItems(),
  component: SetupPage,
});

function SetupPage() {
  const items = Route.useLoaderData();
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
      queryClient.invalidateQueries({ queryKey: ["cbsItemsByL1Paged"] });
      queryClient.invalidateQueries({ queryKey: ["cbsItemsByL1Filtered"] });
      queryClient.invalidateQueries({
        queryKey: ["allowedFefCbsItemIds", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["allowedCbsL1Codes", projectId],
      });
    },
    onError: (err, vars) => {
      console.error("[setup] updateAllowedFefCbsItems failed", { err, vars });
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

      <div className="relative border border-slate-200 rounded-md bg-white">
        {isFiltering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm rounded-md">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-sm">Filtering…</span>
            </div>
          </div>
        )}
        {filteredTree.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No matches.</div>
        ) : (
          <ul role="tree" className="py-1">
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
  const label = item?.name || item?.accountDescription || node.segment;
  const code = item?.displayCode ?? node.segment;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className="flex items-center gap-2 py-1 pr-2 hover:bg-slate-50"
        style={{ paddingLeft: depth * 18 + 8 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(node.pathKey)}
          className="flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-0"
          disabled={!hasChildren}
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : null}
        </button>
        <Checkbox
          checked={
            state === "indeterminate" ? "indeterminate" : state === "checked"
          }
          onCheckedChange={() => onToggleSelect(node)}
          aria-label={`Toggle ${label}`}
        />
        <span className="font-mono text-xs text-slate-500 tabular-nums">
          {code}
        </span>
        <span className="text-sm text-slate-800 truncate">{label}</span>
        {item?.uom && (
          <span className="ml-auto text-xs text-slate-400">{item.uom}</span>
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
