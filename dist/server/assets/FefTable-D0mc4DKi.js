import { C as useFefTableState, D as TabsList, E as TabsContent, O as TabsTrigger, S as readOnlyCellClass, T as Tabs, _ as FefTableContent, b as TAKE_OFF_INITIAL_ROWS, c as RoleSelectCell, f as TotalCostCell, g as FIELD_ESTIMATE_INITIAL_ROWS, h as EditableCell, l as ScheduleSelectCell, m as CbsSelectCell, n as sumMaterialCost, r as tabTriggerClass, t as sumLaborCost, v as ReadOnlyCell, w as useTakeOffSync, x as TakeOffIdReadOnlyCell } from "./fef-helpers-DzaK2f1D.js";
import { a as setMaterialsSectionTotal, t as setLaborTotal } from "./laborTotalsStore-Ca0P01T2.js";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { createColumnHelper } from "@tanstack/react-table";
//#region src/components/FefTable.tsx
var columnHelper = createColumnHelper();
function MaterialsTotalCostCell({ row }) {
	const qty = parseFloat(row.original.quantity);
	const cost = parseFloat(row.original.materialCost);
	const total = !isNaN(qty) && !isNaN(cost) && row.original.quantity !== "" && row.original.materialCost !== "" ? (qty * cost).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}) : "";
	return /* @__PURE__ */ jsx("span", {
		className: readOnlyCellClass,
		children: total ? `$${total}` : ""
	});
}
var fieldEstimateColumns = [
	columnHelper.accessor("id", {
		header: "ID",
		cell: ReadOnlyCell,
		size: 150
	}),
	columnHelper.accessor("description", {
		header: "Description",
		cell: CbsSelectCell,
		size: 300
	}),
	columnHelper.accessor("role", {
		header: "Role",
		cell: RoleSelectCell,
		size: 180
	}),
	columnHelper.accessor("schedule", {
		header: "Schedule",
		cell: ScheduleSelectCell,
		size: 150
	}),
	columnHelper.accessor("quantity", {
		header: "Quantity",
		cell: EditableCell
	}),
	columnHelper.accessor("unit", {
		header: "Unit",
		cell: ReadOnlyCell
	}),
	columnHelper.accessor("laborHours", {
		header: "Labor Hours",
		cell: EditableCell
	}),
	columnHelper.accessor("laborRate", {
		header: "Labor Rate ($)",
		cell: ReadOnlyCell
	}),
	columnHelper.display({
		id: "totalCost",
		header: "Total Cost ($)",
		cell: TotalCostCell,
		size: 130
	}),
	columnHelper.accessor("notes", {
		header: "Notes",
		cell: EditableCell
	})
];
var takeOffColumns = [
	columnHelper.accessor("id", {
		header: "ID",
		cell: TakeOffIdReadOnlyCell,
		size: 150
	}),
	columnHelper.accessor("description", {
		header: "Description",
		cell: CbsSelectCell,
		size: 300
	}),
	columnHelper.accessor("role", {
		header: "Role",
		cell: RoleSelectCell,
		size: 180
	}),
	columnHelper.accessor("schedule", {
		header: "Schedule",
		cell: ScheduleSelectCell,
		size: 150
	}),
	columnHelper.accessor("quantity", {
		header: "Quantity",
		cell: EditableCell
	}),
	columnHelper.accessor("unit", {
		header: "Unit",
		cell: ReadOnlyCell
	}),
	columnHelper.accessor("laborHours", {
		header: "Labor Hours",
		cell: EditableCell
	}),
	columnHelper.accessor("laborRate", {
		header: "Labor Rate ($)",
		cell: ReadOnlyCell
	}),
	columnHelper.display({
		id: "totalCost",
		header: "Total Cost ($)",
		cell: TotalCostCell,
		size: 130
	}),
	columnHelper.accessor("notes", {
		header: "Notes",
		cell: EditableCell
	})
];
var materialsColumns = [
	columnHelper.accessor("id", {
		header: "ID",
		cell: ReadOnlyCell,
		size: 150
	}),
	columnHelper.accessor("description", {
		header: "Description",
		cell: ReadOnlyCell,
		size: 300
	}),
	columnHelper.accessor("quantity", {
		header: "Quantity",
		cell: EditableCell
	}),
	columnHelper.accessor("unit", {
		header: "Unit",
		cell: ReadOnlyCell
	}),
	columnHelper.accessor("materialCost", {
		header: "Material Cost ($)",
		cell: EditableCell
	}),
	columnHelper.display({
		id: "totalCost",
		header: "Total Cost ($)",
		cell: MaterialsTotalCostCell
	}),
	columnHelper.accessor("notes", {
		header: "Notes",
		cell: EditableCell
	})
];
function DisciplinePage({ title, icon: Icon, initialRows, cbsOptions, variant, sectionKey, laborKey, roleOptions, scheduleOptions, roleRates }) {
	const takeOffState = useFefTableState({
		initialRows: variant === "materials" ? initialRows : TAKE_OFF_INITIAL_ROWS,
		sectionKey: variant === "materials" ? sectionKey : void 0
	});
	const fieldEstimateState = useFefTableState({ initialRows: FIELD_ESTIMATE_INITIAL_ROWS });
	const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);
	React.useEffect(() => {
		if (!laborKey) return;
		setLaborTotal(laborKey, sumLaborCost(fieldEstimateState.data));
	}, [laborKey, fieldEstimateState.data]);
	React.useEffect(() => {
		if (variant !== "materials" || !sectionKey) return;
		setMaterialsSectionTotal(sectionKey, sumMaterialCost(takeOffState.data));
	}, [
		variant,
		sectionKey,
		takeOffState.data
	]);
	const baseMeta = { cbsOptions };
	const laborMeta = {
		...baseMeta,
		roleOptions,
		scheduleOptions,
		roleRates
	};
	if (variant === "materials") return /* @__PURE__ */ jsx(FefTableContent, {
		state: takeOffState,
		meta: baseMeta,
		columns: materialsColumns
	});
	const tabs = /* @__PURE__ */ jsxs(Tabs, {
		defaultValue: "takeoff",
		className: "w-full",
		onValueChange: (v) => {
			if (v === "estimate") syncToFieldEstimate();
		},
		children: [
			/* @__PURE__ */ jsxs(TabsList, {
				className: "w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 pb-2 h-auto gap-2",
				children: [/* @__PURE__ */ jsx(TabsTrigger, {
					value: "takeoff",
					className: tabTriggerClass,
					children: "Take Off"
				}), /* @__PURE__ */ jsx(TabsTrigger, {
					value: "estimate",
					className: tabTriggerClass,
					children: "Field Estimate"
				})]
			}),
			/* @__PURE__ */ jsx(TabsContent, {
				value: "takeoff",
				className: "mt-4",
				children: /* @__PURE__ */ jsx(FefTableContent, {
					state: takeOffState,
					meta: laborMeta,
					columns: takeOffColumns
				})
			}),
			/* @__PURE__ */ jsx(TabsContent, {
				value: "estimate",
				className: "mt-4",
				children: /* @__PURE__ */ jsx(FefTableContent, {
					state: fieldEstimateState,
					meta: laborMeta,
					columns: fieldEstimateColumns
				})
			})
		]
	});
	if (!title) return tabs;
	return /* @__PURE__ */ jsxs("main", {
		className: "p-3 md:p-4",
		children: [/* @__PURE__ */ jsxs("h1", {
			className: "text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2",
			children: [Icon && /* @__PURE__ */ jsx(Icon, { className: "size-6 md:size-7" }), title]
		}), tabs]
	});
}
//#endregion
export { DisciplinePage as t };
