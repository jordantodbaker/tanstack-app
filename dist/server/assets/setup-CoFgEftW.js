import { i as updateAllowedFefCbsItems, n as allowedFefCbsItemIdsQueryOptions, o as useSelectedProject } from "./setup-DOEkvnEs.js";
import { t as cn } from "./utils-Bn6jYw4Z.js";
import { n as ProjectSelect, t as Route } from "./setup-efOiTaPJ.js";
import { t as Input } from "./input-DzVBLfOo.js";
import { t as Button } from "./button-Bae12qhq.js";
import * as React$1 from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ChevronDown, ChevronRight, MinusIcon, Settings } from "lucide-react";
import { Checkbox } from "radix-ui";
//#region src/lib/cbs-tree.ts
var LEVEL_DEFAULT = "00";
function getGroupL1(l1) {
	if (l1.length < 3) return l1;
	const firstTwo = Number.parseInt(l1.substring(0, 2), 10);
	if (Number.isNaN(firstTwo)) return l1;
	if (firstTwo < 10) return `0${l1[1]}0`;
	return `${l1[0]}00`;
}
function getPath(item) {
	const group = getGroupL1(item.l1);
	const path = [group];
	if (item.l1 !== group) path.push(item.l1);
	if (item.l2 !== LEVEL_DEFAULT) {
		path.push(item.l2);
		if (item.l3 !== LEVEL_DEFAULT) {
			path.push(item.l3);
			if (item.l4 !== LEVEL_DEFAULT) {
				path.push(item.l4);
				if (item.l5 !== LEVEL_DEFAULT) path.push(item.l5);
			}
		}
	}
	return path;
}
function buildCbsTree(items) {
	const root = { children: /* @__PURE__ */ new Map() };
	function ensureNode(item) {
		const path = getPath(item);
		let parent = root;
		let pathKey = "";
		let node;
		let depth = 0;
		for (const segment of path) {
			depth++;
			pathKey = pathKey ? `${pathKey}|${segment}` : segment;
			const existing = parent.children.get(segment);
			if (existing) node = existing;
			else {
				node = {
					pathKey,
					depth,
					segment,
					item: null,
					children: /* @__PURE__ */ new Map()
				};
				parent.children.set(segment, node);
			}
			parent = node;
		}
		return node;
	}
	for (const item of items) {
		const node = ensureNode(item);
		if (!node.item) node.item = item;
	}
	function toOutput(node) {
		const children = Array.from(node.children.values()).sort((a, b) => a.segment.localeCompare(b.segment)).map(toOutput);
		const descendantItemIds = [];
		if (node.item) descendantItemIds.push(node.item.id);
		for (const c of children) descendantItemIds.push(...c.descendantItemIds);
		return {
			pathKey: node.pathKey,
			depth: node.depth,
			segment: node.segment,
			item: node.item,
			children,
			descendantItemIds
		};
	}
	return Array.from(root.children.values()).sort((a, b) => a.segment.localeCompare(b.segment)).map(toOutput);
}
function getNodeSelectionState(node, selectedIds) {
	let selected = 0;
	for (const id of node.descendantItemIds) if (selectedIds.has(id)) selected++;
	if (selected === 0) return "unchecked";
	if (selected === node.descendantItemIds.length) return "checked";
	return "indeterminate";
}
function nodeMatchesSearch(node, query) {
	if (!query) return true;
	const q = query.toLowerCase();
	const item = node.item;
	if (item) {
		if (item.displayCode.toLowerCase().includes(q)) return true;
		if (item.name.toLowerCase().includes(q)) return true;
		if (item.accountDescription.toLowerCase().includes(q)) return true;
	}
	return node.children.some((c) => nodeMatchesSearch(c, q));
}
//#endregion
//#region src/components/ui/checkbox.tsx
function Checkbox$1({ className, ...props }) {
	return /* @__PURE__ */ jsx(Checkbox.Root, {
		"data-slot": "checkbox",
		className: cn("peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:data-checked:bg-primary", className),
		...props,
		children: /* @__PURE__ */ jsx(Checkbox.Indicator, {
			"data-slot": "checkbox-indicator",
			className: "grid place-content-center text-current transition-none [&>svg]:size-3.5",
			children: props.checked === "indeterminate" ? /* @__PURE__ */ jsx(MinusIcon, {}) : /* @__PURE__ */ jsx(CheckIcon, {})
		})
	});
}
//#endregion
//#region src/routes/setup.tsx?tsr-split=component
function SetupPage() {
	const items = Route.useLoaderData();
	const { projectId } = useSelectedProject();
	const tree = React$1.useMemo(() => buildCbsTree(items), [items]);
	return /* @__PURE__ */ jsxs("main", {
		className: "p-4 max-w-5xl",
		children: [
			/* @__PURE__ */ jsxs("h1", {
				className: "text-2xl font-bold mb-4 flex items-center gap-2",
				children: [/* @__PURE__ */ jsx(Settings, { className: "size-7" }), "Setup"]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex items-center gap-2",
				children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "setup-project",
					className: "text-sm font-medium",
					children: "Project:"
				}), /* @__PURE__ */ jsx(ProjectSelect, { id: "setup-project" })]
			}),
			projectId === null ? /* @__PURE__ */ jsx("p", {
				className: "text-sm text-slate-500",
				children: "Choose a project to configure which CBS items are allowed in the Field Estimate Form."
			}) : /* @__PURE__ */ jsx(CbsTreeEditorLoader, {
				projectId,
				tree
			}, projectId)
		]
	});
}
function CbsTreeEditorLoader({ projectId, tree }) {
	const allowedQuery = useQuery(allowedFefCbsItemIdsQueryOptions(projectId));
	if (allowedQuery.isPending) return /* @__PURE__ */ jsx("div", {
		className: "text-sm text-slate-500",
		children: "Loading…"
	});
	if (allowedQuery.isError) return /* @__PURE__ */ jsx("div", {
		className: "text-sm text-red-600",
		children: "Failed to load allowed items."
	});
	return /* @__PURE__ */ jsx(CbsTreeEditor, {
		projectId,
		tree,
		initialAllowedIds: allowedQuery.data ?? []
	});
}
function CbsTreeEditor({ projectId, tree, initialAllowedIds }) {
	const [selectedIds, setSelectedIds] = React$1.useState(() => new Set(initialAllowedIds));
	const [expanded, setExpanded] = React$1.useState(() => /* @__PURE__ */ new Set());
	const [search, setSearch] = React$1.useState("");
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: (vars) => updateAllowedFefCbsItems({ data: {
			projectId,
			addIds: vars.addIds,
			removeIds: vars.removeIds
		} }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["cbsItemsByL1Paged"] });
			queryClient.invalidateQueries({ queryKey: ["cbsItemsByL1Filtered"] });
			queryClient.invalidateQueries({ queryKey: ["allowedFefCbsItemIds", projectId] });
			queryClient.invalidateQueries({ queryKey: ["allowedCbsL1Codes", projectId] });
		}
	});
	const filteredTree = React$1.useMemo(() => {
		if (!search.trim()) return tree;
		const q = search.trim();
		function filter(nodes) {
			const out = [];
			for (const n of nodes) if (nodeMatchesSearch(n, q)) out.push({
				...n,
				children: filter(n.children)
			});
			return out;
		}
		return filter(tree);
	}, [tree, search]);
	const allPathKeys = React$1.useMemo(() => {
		const keys = [];
		function walk(nodes) {
			for (const n of nodes) if (n.children.length > 0) {
				keys.push(n.pathKey);
				walk(n.children);
			}
		}
		walk(tree);
		return keys;
	}, [tree]);
	const effectiveExpanded = React$1.useMemo(() => {
		if (!search.trim()) return expanded;
		const out = new Set(expanded);
		function walk(nodes) {
			for (const n of nodes) if (n.children.length > 0) {
				out.add(n.pathKey);
				walk(n.children);
			}
		}
		walk(filteredTree);
		return out;
	}, [
		search,
		expanded,
		filteredTree
	]);
	const totalSelected = selectedIds.size;
	function toggleExpand(pathKey) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(pathKey)) next.delete(pathKey);
			else next.add(pathKey);
			return next;
		});
	}
	function toggleNode(node) {
		const state = getNodeSelectionState(node, selectedIds);
		const ids = node.descendantItemIds;
		if (state === "checked") {
			const removeIds = ids.filter((id) => selectedIds.has(id));
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const id of removeIds) next.delete(id);
				return next;
			});
			if (removeIds.length > 0) mutation.mutate({
				addIds: [],
				removeIds
			});
		} else {
			const addIds = ids.filter((id) => !selectedIds.has(id));
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const id of addIds) next.add(id);
				return next;
			});
			if (addIds.length > 0) mutation.mutate({
				addIds,
				removeIds: []
			});
		}
	}
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-3",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2 flex-wrap",
			children: [
				/* @__PURE__ */ jsx(Input, {
					placeholder: "Search by code, name, or description…",
					value: search,
					onChange: (e) => setSearch(e.target.value),
					className: "max-w-sm"
				}),
				/* @__PURE__ */ jsx(Button, {
					variant: "outline",
					size: "sm",
					onClick: () => setExpanded(new Set(allPathKeys)),
					children: "Expand all"
				}),
				/* @__PURE__ */ jsx(Button, {
					variant: "outline",
					size: "sm",
					onClick: () => setExpanded(/* @__PURE__ */ new Set()),
					children: "Collapse all"
				}),
				/* @__PURE__ */ jsxs("span", {
					className: "ml-auto text-sm text-slate-600",
					children: [
						totalSelected.toLocaleString(),
						" selected",
						mutation.isPending && /* @__PURE__ */ jsx("span", {
							className: "ml-2 text-slate-400",
							children: "saving…"
						}),
						mutation.isError && /* @__PURE__ */ jsx("span", {
							className: "ml-2 text-red-600",
							children: "save failed"
						})
					]
				})
			]
		}), /* @__PURE__ */ jsx("div", {
			className: "border border-slate-200 rounded-md bg-white",
			children: filteredTree.length === 0 ? /* @__PURE__ */ jsx("div", {
				className: "p-4 text-sm text-slate-500",
				children: "No matches."
			}) : /* @__PURE__ */ jsx("ul", {
				role: "tree",
				className: "py-1",
				children: filteredTree.map((node) => /* @__PURE__ */ jsx(TreeRow, {
					node,
					depth: 0,
					selectedIds,
					expanded: effectiveExpanded,
					onToggleExpand: toggleExpand,
					onToggleSelect: toggleNode
				}, node.pathKey))
			})
		})]
	});
}
function TreeRow({ node, depth, selectedIds, expanded, onToggleExpand, onToggleSelect }) {
	const hasChildren = node.children.length > 0;
	const isOpen = expanded.has(node.pathKey);
	const state = getNodeSelectionState(node, selectedIds);
	const item = node.item;
	const label = item?.name || item?.accountDescription || node.segment;
	const code = item?.displayCode ?? node.segment;
	return /* @__PURE__ */ jsxs("li", {
		role: "treeitem",
		"aria-expanded": hasChildren ? isOpen : void 0,
		children: [/* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2 py-1 pr-2 hover:bg-slate-50",
			style: { paddingLeft: depth * 18 + 8 },
			children: [
				/* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: () => hasChildren && onToggleExpand(node.pathKey),
					className: "flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-0",
					disabled: !hasChildren,
					"aria-label": isOpen ? "Collapse" : "Expand",
					children: hasChildren ? isOpen ? /* @__PURE__ */ jsx(ChevronDown, { size: 14 }) : /* @__PURE__ */ jsx(ChevronRight, { size: 14 }) : null
				}),
				/* @__PURE__ */ jsx(Checkbox$1, {
					checked: state === "indeterminate" ? "indeterminate" : state === "checked",
					onCheckedChange: () => onToggleSelect(node),
					"aria-label": `Toggle ${label}`
				}),
				/* @__PURE__ */ jsx("span", {
					className: "font-mono text-xs text-slate-500 tabular-nums",
					children: code
				}),
				/* @__PURE__ */ jsx("span", {
					className: "text-sm text-slate-800 truncate",
					children: label
				}),
				item?.uom && /* @__PURE__ */ jsx("span", {
					className: "ml-auto text-xs text-slate-400",
					children: item.uom
				})
			]
		}), hasChildren && isOpen && /* @__PURE__ */ jsx("ul", {
			role: "group",
			children: node.children.map((child) => /* @__PURE__ */ jsx(TreeRow, {
				node: child,
				depth: depth + 1,
				selectedIds,
				expanded,
				onToggleExpand,
				onToggleSelect
			}, child.pathKey))
		})]
	});
}
//#endregion
export { SetupPage as component };
