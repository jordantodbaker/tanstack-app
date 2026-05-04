import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Settings } from "lucide-react";
import {
  fetchSetupProjects,
  fetchSetupCbsItems,
  fetchAllowedFefCbsItemIds,
  updateAllowedFefCbsItems,
} from "~/utils/setup";
import {
  buildCbsTree,
  getNodeSelectionState,
  nodeMatchesSearch,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/setup")({
  validateSearch: (search: Record<string, unknown>) => ({
    project: search.project ? Number(search.project) : undefined,
  }),
  loaderDeps: ({ search }) => ({ project: search.project }),
  loader: async ({ deps }) => {
    const [projects, items, allowedIds] = await Promise.all([
      fetchSetupProjects(),
      fetchSetupCbsItems(),
      deps.project
        ? fetchAllowedFefCbsItemIds({ data: deps.project })
        : Promise.resolve([] as number[]),
    ]);
    return { projects, items, allowedIds, projectId: deps.project };
  },
  component: SetupPage,
});

function SetupPage() {
  const { projects, items, allowedIds, projectId } = Route.useLoaderData();
  const navigate = useNavigate();
  const tree = React.useMemo(() => buildCbsTree(items), [items]);

  return (
    <main className="p-4 max-w-5xl">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Settings className="size-7" />
        Setup
      </h1>

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="project" className="text-sm font-medium">
          Project:
        </label>
        <select
          id="project"
          className="h-8 rounded-md border border-input bg-white px-2 text-sm"
          value={projectId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            navigate({
              to: "/setup",
              search: { project: v ? Number(v) : undefined },
            });
          }}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayId} — {p.name}
            </option>
          ))}
        </select>
      </div>

      {projectId === undefined ? (
        <p className="text-sm text-slate-500">
          Choose a project to configure which CBS items are allowed in the
          Field Estimate Form.
        </p>
      ) : (
        <CbsTreeEditor
          key={projectId}
          projectId={projectId}
          tree={tree}
          initialAllowedIds={allowedIds}
        />
      )}
    </main>
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

  const mutation = useMutation({
    mutationFn: (vars: { addIds: number[]; removeIds: number[] }) =>
      updateAllowedFefCbsItems({
        data: { projectId, addIds: vars.addIds, removeIds: vars.removeIds },
      }),
  });

  const filteredTree = React.useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.trim();
    function filter(nodes: CbsTreeNode[]): CbsTreeNode[] {
      const out: CbsTreeNode[] = [];
      for (const n of nodes) {
        if (nodeMatchesSearch(n, q)) {
          out.push({ ...n, children: filter(n.children) });
        }
      }
      return out;
    }
    return filter(tree);
  }, [tree, search]);

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

  // When searching, auto-expand all matched paths so results are visible.
  const effectiveExpanded = React.useMemo(() => {
    if (!search.trim()) return expanded;
    const out = new Set(expanded);
    function walk(nodes: CbsTreeNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          out.add(n.pathKey);
          walk(n.children);
        }
      }
    }
    walk(filteredTree);
    return out;
  }, [search, expanded, filteredTree]);

  const totalSelected = selectedIds.size;

  function toggleExpand(pathKey: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }

  function toggleNode(node: CbsTreeNode) {
    const state = getNodeSelectionState(node, selectedIds);
    const ids = node.descendantItemIds;
    if (state === "checked") {
      const removeIds = ids.filter((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of removeIds) next.delete(id);
        return next;
      });
      if (removeIds.length > 0)
        mutation.mutate({ addIds: [], removeIds });
    } else {
      const addIds = ids.filter((id) => !selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of addIds) next.add(id);
        return next;
      });
      if (addIds.length > 0) mutation.mutate({ addIds, removeIds: [] });
    }
  }

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

      <div className="border border-slate-200 rounded-md bg-white">
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
                expanded={effectiveExpanded}
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

function TreeRow({
  node,
  depth,
  selectedIds,
  expanded,
  onToggleExpand,
  onToggleSelect,
}: {
  node: CbsTreeNode;
  depth: number;
  selectedIds: Set<number>;
  expanded: Set<string>;
  onToggleExpand: (pathKey: string) => void;
  onToggleSelect: (node: CbsTreeNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.pathKey);
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
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
