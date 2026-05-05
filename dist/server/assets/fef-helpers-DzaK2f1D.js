import { n as computeBoreSize, t as cn } from "./utils-Bn6jYw4Z.js";
import { i as setMaterialsSectionRows, r as getMaterialsSectionRows } from "./laborTotalsStore-Ca0P01T2.js";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { cva } from "class-variance-authority";
import { Tabs } from "radix-ui";
//#region src/components/ui/tabs.tsx
function Tabs$1({ className, orientation = "horizontal", ...props }) {
	return /* @__PURE__ */ jsx(Tabs.Root, {
		"data-slot": "tabs",
		"data-orientation": orientation,
		className: cn("group/tabs flex gap-2 data-horizontal:flex-col", className),
		...props
	});
}
var tabsListVariants = cva("group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none", {
	variants: { variant: {
		default: "bg-muted",
		line: "gap-1 bg-transparent"
	} },
	defaultVariants: { variant: "default" }
});
function TabsList({ className, variant = "default", ...props }) {
	return /* @__PURE__ */ jsx(Tabs.List, {
		"data-slot": "tabs-list",
		"data-variant": variant,
		className: cn(tabsListVariants({ variant }), className),
		...props
	});
}
function TabsTrigger({ className, ...props }) {
	return /* @__PURE__ */ jsx(Tabs.Trigger, {
		"data-slot": "tabs-trigger",
		className: cn("relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:py-[calc(--spacing(1.25))] hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5", "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent", "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground", "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100", className),
		...props
	});
}
function TabsContent({ className, ...props }) {
	return /* @__PURE__ */ jsx(Tabs.Content, {
		"data-slot": "tabs-content",
		className: cn("flex-1 text-xs/relaxed outline-none", className),
		...props
	});
}
//#endregion
//#region src/lib/table-utils.tsx
var editableCellClass = "w-full bg-white border border-slate-200 px-2 py-1 text-sm hover:border-blue-300 focus:border-blue-400 focus:outline-none rounded";
var readOnlyCellClass = "block px-2 py-1 text-sm text-slate-500 bg-slate-100";
function makeBlankRow(i) {
	return {
		id: `__fe-blank-${i}`,
		description: "",
		shopField: "",
		weldGroupDescription: "",
		quantity: "",
		size: "",
		unit: "",
		metallurgyCode: "",
		boreSize: "",
		role: "",
		schedule: "",
		taskCode: "",
		laborHours: "",
		laborRate: "",
		materialCost: "",
		equipment: "",
		notes: ""
	};
}
var TAKE_OFF_INITIAL_ROWS = Array.from({ length: 25 }, (_, i) => makeBlankRow(i));
var FIELD_ESTIMATE_INITIAL_ROWS = [];
function useTakeOffSync(source, target) {
	const syncedIds = React.useRef(/* @__PURE__ */ new Set());
	return () => {
		const qualifiedRows = source.data.filter((r) => Number(r.quantity) > 0 && !r.id.startsWith("__fe-blank-"));
		const qualifiedIds = new Set(qualifiedRows.map((r) => r.id));
		const qualifiedMap = new Map(qualifiedRows.map((r) => [r.id, r]));
		const prevSyncedIds = syncedIds.current;
		target.setData((prev) => {
			const prevIds = new Set(prev.map((r) => r.id));
			const retained = prev.filter((r) => !prevSyncedIds.has(r.id) || qualifiedIds.has(r.id)).map((r) => qualifiedMap.has(r.id) ? { ...qualifiedMap.get(r.id) } : r);
			const added = qualifiedRows.filter((r) => !prevIds.has(r.id)).map((r) => ({ ...r }));
			return [...retained, ...added];
		});
		syncedIds.current = qualifiedIds;
	};
}
function EditableCell({ getValue, row, column, table }) {
	const initialValue = getValue();
	const [value, setValue] = React.useState(initialValue);
	React.useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);
	const onBlur = () => {
		table.options.meta?.updateData?.(row.index, column.id, value);
	};
	return /* @__PURE__ */ jsx("input", {
		className: editableCellClass,
		value,
		onChange: (e) => setValue(e.target.value),
		onBlur
	});
}
function SizeCell({ getValue, row, table }) {
	const initialValue = getValue();
	const [value, setValue] = React.useState(initialValue);
	React.useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);
	const onBlur = () => {
		table.options.meta?.updateRow?.(row.index, {
			size: value,
			boreSize: computeBoreSize(value)
		});
	};
	return /* @__PURE__ */ jsx("input", {
		className: editableCellClass,
		value,
		onChange: (e) => setValue(e.target.value),
		onBlur
	});
}
function CbsSelectCell({ row, table }) {
	const cbsOptions = table.options.meta?.cbsOptions ?? [];
	const currentDisplayCode = row.original.id;
	const handleChange = (e) => {
		const selected = cbsOptions.find((o) => o.displayCode === e.target.value);
		if (selected) table.options.meta?.updateRow?.(row.index, {
			id: selected.displayCode,
			description: selected.name,
			unit: selected.uom
		});
	};
	return /* @__PURE__ */ jsxs("select", {
		className: editableCellClass,
		value: currentDisplayCode,
		onChange: handleChange,
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: "-- Select --"
		}), cbsOptions.map((opt) => /* @__PURE__ */ jsx("option", {
			value: opt.displayCode,
			children: opt.displayDescription ?? `${opt.displayCode}: ${opt.name}`
		}, opt.displayCode))]
	});
}
function TakeOffIdReadOnlyCell({ getValue }) {
	const raw = getValue();
	return /* @__PURE__ */ jsx("span", {
		className: readOnlyCellClass,
		children: raw.startsWith("__fe-blank-") ? "" : raw
	});
}
function ReadOnlyCell({ getValue }) {
	return /* @__PURE__ */ jsx("span", {
		className: readOnlyCellClass,
		children: getValue()
	});
}
function TablePagination({ table, totalCount }) {
	const rowCount = totalCount ?? table.getFilteredRowModel().rows.length;
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-center justify-between mt-3 text-sm text-gray-600",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ jsx("button", {
					className: "px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100",
					onClick: () => table.firstPage(),
					disabled: !table.getCanPreviousPage(),
					children: "<<"
				}),
				/* @__PURE__ */ jsx("button", {
					className: "px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100",
					onClick: () => table.previousPage(),
					disabled: !table.getCanPreviousPage(),
					children: "<"
				}),
				/* @__PURE__ */ jsx("button", {
					className: "px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100",
					onClick: () => table.nextPage(),
					disabled: !table.getCanNextPage(),
					children: ">"
				}),
				/* @__PURE__ */ jsx("button", {
					className: "px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100",
					onClick: () => table.lastPage(),
					disabled: !table.getCanNextPage(),
					children: ">>"
				})
			]
		}), /* @__PURE__ */ jsxs("span", { children: [
			"Page ",
			table.getState().pagination.pageIndex + 1,
			" of ",
			table.getPageCount(),
			" — ",
			rowCount,
			" rows"
		] })]
	});
}
function ColumnFilter({ column, data }) {
	const value = column.getFilterValue() ?? "";
	const options = React.useMemo(() => Array.from(new Set(data.map((row) => row[column.id]).filter((v) => v !== void 0))).sort(), [data, column.id]);
	if (options.length === 0) return null;
	return /* @__PURE__ */ jsxs("select", {
		className: "mt-1 w-full border border-gray-300 px-1 py-0.5 text-xs font-normal rounded focus:border-blue-400 focus:outline-none bg-white",
		value,
		onChange: (e) => column.setFilterValue(e.target.value || void 0),
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: "All"
		}), options.map((opt) => /* @__PURE__ */ jsx("option", {
			value: opt,
			children: opt
		}, opt))]
	});
}
function useFefTableState(opts = {}) {
	const { initialRows, sectionKey } = opts;
	const [data, setDataState] = React.useState(() => {
		if (sectionKey) {
			const cached = getMaterialsSectionRows(sectionKey);
			if (cached) return cached;
		}
		return initialRows ?? TAKE_OFF_INITIAL_ROWS;
	});
	const [columnFilters, setColumnFilters] = React.useState([]);
	const setData = React.useCallback((updater) => {
		setDataState((old) => {
			const next = typeof updater === "function" ? updater(old) : updater;
			if (sectionKey) setMaterialsSectionRows(sectionKey, next);
			return next;
		});
	}, [sectionKey]);
	React.useEffect(() => {
		if (sectionKey) return;
		if (initialRows !== void 0) setDataState(initialRows);
	}, [initialRows, sectionKey]);
	return {
		data,
		setData,
		columnFilters,
		setColumnFilters
	};
}
function FefTableContent({ state, meta, columns, serverPagination }) {
	const { data, setData, columnFilters, setColumnFilters } = state;
	const [localPageIndex, setLocalPageIndex] = React.useState(0);
	const pagination = serverPagination ? {
		pageIndex: serverPagination.pageIndex,
		pageSize: serverPagination.pageSize
	} : {
		pageIndex: localPageIndex,
		pageSize: 25
	};
	const table = useReactTable({
		data,
		columns,
		manualPagination: !!serverPagination,
		pageCount: serverPagination ? Math.ceil(serverPagination.totalCount / serverPagination.pageSize) : void 0,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onColumnFiltersChange: setColumnFilters,
		onPaginationChange: (updater) => {
			const next = typeof updater === "function" ? updater(pagination) : updater;
			if (serverPagination) serverPagination.onPageChange(next.pageIndex);
			else setLocalPageIndex(next.pageIndex);
		},
		state: {
			columnFilters,
			pagination
		},
		meta: {
			cbsOptions: meta?.cbsOptions ?? [],
			weldGroupOptions: meta?.weldGroupOptions ?? [],
			weldGroupMaterialMap: meta?.weldGroupMaterialMap ?? {},
			roleOptions: meta?.roleOptions ?? [],
			scheduleOptions: meta?.scheduleOptions ?? [],
			roleRates: meta?.roleRates ?? [],
			taskCodeOptions: meta?.taskCodeOptions ?? [],
			pipingFactorLookup: meta?.pipingFactorLookup,
			updateData: (rowIndex, columnId, value) => {
				setData((old) => old.map((row, index) => index === rowIndex ? {
					...row,
					[columnId]: value
				} : row));
			},
			updateRow: (rowIndex, updates) => {
				setData((old) => old.map((row, index) => index === rowIndex ? {
					...row,
					...updates
				} : row));
			}
		}
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "overflow-x-auto",
		children: [/* @__PURE__ */ jsxs("table", {
			className: "w-full border-collapse text-sm",
			children: [/* @__PURE__ */ jsx("thead", { children: table.getHeaderGroups().map((headerGroup) => /* @__PURE__ */ jsx("tr", {
				className: "bg-gray-100",
				children: headerGroup.headers.map((header) => /* @__PURE__ */ jsx("th", {
					style: { minWidth: header.column.getSize() },
					className: "border border-gray-300 px-3 py-2 text-left font-semibold",
					children: /* @__PURE__ */ jsxs("div", {
						className: "flex flex-col gap-1",
						children: [/* @__PURE__ */ jsx("span", {
							className: "whitespace-nowrap",
							children: flexRender(header.column.columnDef.header, header.getContext())
						}), /* @__PURE__ */ jsx(ColumnFilter, {
							column: header.column,
							data
						})]
					})
				}, header.id))
			}, headerGroup.id)) }), /* @__PURE__ */ jsx("tbody", { children: table.getRowModel().rows.map((row, i) => /* @__PURE__ */ jsx("tr", {
				className: i % 2 === 0 ? "bg-white" : "bg-gray-50",
				children: row.getVisibleCells().map((cell) => /* @__PURE__ */ jsx("td", {
					style: { minWidth: cell.column.getSize() },
					className: "border border-gray-300",
					children: flexRender(cell.column.columnDef.cell, cell.getContext())
				}, cell.id))
			}, row.id)) })]
		}), /* @__PURE__ */ jsx(TablePagination, {
			table,
			totalCount: serverPagination?.totalCount
		})]
	});
}
//#endregion
//#region src/components/Piping/cells.tsx
function lookupCbsItem(metallurgyCode, boreSize, cbsOptions) {
	if (!metallurgyCode || !boreSize) return void 0;
	const code = `${metallurgyCode}${boreSize}ST0000C`;
	return cbsOptions.find((o) => o.costCode === code);
}
function ShopFieldSelectCell({ getValue, row, table }) {
	return /* @__PURE__ */ jsxs("select", {
		className: editableCellClass,
		value: getValue(),
		onChange: (e) => {
			const newShopField = e.target.value;
			const rowData = table.getRowModel().rows[row.index].original;
			const map = table.options.meta?.weldGroupMaterialMap ?? {};
			const entry = rowData.weldGroupDescription ? map[rowData.weldGroupDescription] : void 0;
			const metallurgyCode = entry && newShopField ? newShopField === "Shop" ? entry.shopCode : entry.installCode : "";
			const cbsMatch = lookupCbsItem(metallurgyCode, rowData.boreSize, table.options.meta?.cbsOptions ?? []);
			table.options.meta?.updateRow?.(row.index, {
				shopField: newShopField,
				metallurgyCode,
				...cbsMatch ? {
					id: cbsMatch.displayCode,
					description: cbsMatch.name,
					unit: cbsMatch.uom
				} : {}
			});
		},
		children: [
			/* @__PURE__ */ jsx("option", {
				value: "",
				children: "-- Select --"
			}),
			/* @__PURE__ */ jsx("option", {
				value: "Shop",
				children: "Shop"
			}),
			/* @__PURE__ */ jsx("option", {
				value: "Field",
				children: "Field"
			})
		]
	});
}
function WeldGroupSelectCell({ getValue, row, table }) {
	const value = getValue();
	const { weldGroupOptions = [], weldGroupMaterialMap = {} } = table.options.meta ?? {};
	return /* @__PURE__ */ jsxs("select", {
		className: editableCellClass,
		value,
		onChange: (e) => {
			const classification = e.target.value;
			const rowData = table.getRowModel().rows[row.index].original;
			const entry = classification ? weldGroupMaterialMap[classification] : void 0;
			const metallurgyCode = entry && rowData.shopField ? rowData.shopField === "Shop" ? entry.shopCode : entry.installCode : "";
			const cbsMatch = lookupCbsItem(metallurgyCode, rowData.boreSize, table.options.meta?.cbsOptions ?? []);
			table.options.meta?.updateRow?.(row.index, {
				weldGroupDescription: classification,
				metallurgyCode,
				...cbsMatch ? {
					id: cbsMatch.displayCode,
					description: cbsMatch.name,
					unit: cbsMatch.uom
				} : {}
			});
		},
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: "-- Select --"
		}), weldGroupOptions.map((opt) => /* @__PURE__ */ jsx("option", {
			value: opt,
			children: opt
		}, opt))]
	});
}
function TotalCostCell({ row }) {
	const hours = parseFloat(row.original.laborHours);
	const rate = parseFloat(row.original.laborRate);
	return /* @__PURE__ */ jsx("span", {
		className: readOnlyCellClass,
		children: !isNaN(hours) && !isNaN(rate) && row.original.laborRate !== "" ? (hours * rate).toFixed(2) : ""
	});
}
function RoleSelectCell({ getValue, row, table }) {
	const value = getValue();
	const { roleOptions = [], roleRates = [] } = table.options.meta ?? {};
	return /* @__PURE__ */ jsxs("select", {
		className: editableCellClass,
		value,
		onChange: (e) => {
			const newRole = e.target.value;
			const schedule = table.getRowModel().rows[row.index].original.schedule;
			const match = roleRates.find((r) => r.roleName === newRole && r.schedule === schedule);
			table.options.meta?.updateRow?.(row.index, {
				role: newRole,
				laborRate: match ? String(match.rate) : ""
			});
		},
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: "-- Select --"
		}), roleOptions.map((opt) => /* @__PURE__ */ jsx("option", {
			value: opt,
			children: opt
		}, opt))]
	});
}
function laborFactorFor(row, lookup) {
	if (!lookup || !row.taskCode || row.size === "") return void 0;
	const size = parseFloat(row.size);
	if (isNaN(size)) return void 0;
	return lookup.get(row.taskCode)?.values.get(size);
}
function LaborFactorCell({ row, table }) {
	const factor = laborFactorFor(row.original, table.options.meta?.pipingFactorLookup);
	return /* @__PURE__ */ jsx("span", {
		className: readOnlyCellClass,
		children: factor !== void 0 ? String(factor) : ""
	});
}
function LaborHoursCell({ row, table }) {
	const factor = laborFactorFor(row.original, table.options.meta?.pipingFactorLookup);
	const qty = parseFloat(row.original.quantity);
	const computed = factor !== void 0 && !isNaN(qty) && row.original.quantity !== "" ? String(factor * qty) : "";
	const stored = row.original.laborHours;
	const rowIndex = row.index;
	const updateData = table.options.meta?.updateData;
	React.useEffect(() => {
		if (stored !== computed) updateData?.(rowIndex, "laborHours", computed);
	}, [
		stored,
		computed,
		rowIndex,
		updateData
	]);
	return /* @__PURE__ */ jsx("span", {
		className: readOnlyCellClass,
		children: computed
	});
}
function TaskCodeSelectCell({ getValue, row, table }) {
	const value = getValue();
	const { taskCodeOptions = [], pipingFactorLookup } = table.options.meta ?? {};
	return /* @__PURE__ */ jsxs("select", {
		className: editableCellClass,
		value,
		onChange: (e) => {
			const newCode = e.target.value;
			const unit = newCode ? pipingFactorLookup?.get(newCode)?.unit ?? "" : "";
			table.options.meta?.updateRow?.(row.index, {
				taskCode: newCode,
				unit
			});
		},
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: "-- Select --"
		}), taskCodeOptions.map((opt) => /* @__PURE__ */ jsx("option", {
			value: opt,
			children: opt
		}, opt))]
	});
}
function PipingSizeCell({ getValue, row, table }) {
	const initialValue = getValue();
	const [value, setValue] = React.useState(initialValue);
	React.useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);
	const onBlur = () => {
		const boreSize = computeBoreSize(value);
		const rowData = table.getRowModel().rows[row.index].original;
		const cbsMatch = lookupCbsItem(rowData.metallurgyCode, boreSize, table.options.meta?.cbsOptions ?? []);
		table.options.meta?.updateRow?.(row.index, {
			size: value,
			boreSize,
			...cbsMatch ? {
				id: cbsMatch.displayCode,
				description: cbsMatch.name,
				unit: cbsMatch.uom
			} : {}
		});
	};
	return /* @__PURE__ */ jsx("input", {
		className: editableCellClass,
		value,
		onChange: (e) => setValue(e.target.value),
		onBlur
	});
}
function ScheduleSelectCell({ getValue, row, table }) {
	const value = getValue();
	const { scheduleOptions = [], roleRates = [] } = table.options.meta ?? {};
	return /* @__PURE__ */ jsxs("select", {
		className: editableCellClass,
		value,
		onChange: (e) => {
			const newSchedule = e.target.value;
			const role = table.getRowModel().rows[row.index].original.role;
			const match = roleRates.find((r) => r.roleName === role && r.schedule === newSchedule);
			table.options.meta?.updateRow?.(row.index, {
				schedule: newSchedule,
				laborRate: match ? String(match.rate) : ""
			});
		},
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: "-- Select --"
		}), scheduleOptions.map((opt) => /* @__PURE__ */ jsx("option", {
			value: opt,
			children: opt
		}, opt))]
	});
}
//#endregion
//#region src/lib/fef-helpers.ts
function toCbsOption(item) {
	return {
		displayCode: item.displayCode,
		costCode: item.costCode,
		name: item.name ?? "",
		uom: item.uom,
		displayDescription: item.displayDescription ?? null
	};
}
function sumLaborCost(rows) {
	return rows.reduce((acc, row) => {
		const h = parseFloat(row.laborHours);
		const r = parseFloat(row.laborRate);
		return acc + (isNaN(h) || isNaN(r) ? 0 : h * r);
	}, 0);
}
function sumMaterialCost(rows) {
	return rows.reduce((acc, row) => {
		const q = parseFloat(row.quantity);
		const c = parseFloat(row.materialCost);
		return acc + (isNaN(q) || isNaN(c) ? 0 : q * c);
	}, 0);
}
var tabTriggerClass = "rounded-md border border-slate-300 bg-white px-3 md:px-6 py-2.5 md:py-4 text-sm md:text-lg font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 data-active:border-[#a63434] data-active:bg-[#a63434] data-active:text-white data-active:shadow";
//#endregion
export { useFefTableState as C, TabsList as D, TabsContent as E, TabsTrigger as O, readOnlyCellClass as S, Tabs$1 as T, FefTableContent as _, LaborFactorCell as a, TAKE_OFF_INITIAL_ROWS as b, RoleSelectCell as c, TaskCodeSelectCell as d, TotalCostCell as f, FIELD_ESTIMATE_INITIAL_ROWS as g, EditableCell as h, toCbsOption as i, ScheduleSelectCell as l, CbsSelectCell as m, sumMaterialCost as n, LaborHoursCell as o, WeldGroupSelectCell as p, tabTriggerClass as r, PipingSizeCell as s, sumLaborCost as t, ShopFieldSelectCell as u, ReadOnlyCell as v, useTakeOffSync as w, TakeOffIdReadOnlyCell as x, SizeCell as y };
