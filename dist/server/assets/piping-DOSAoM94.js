import { n as disciplineById } from "./disciplines-D-_GrFF6.js";
import { n as allowedFefCbsItemIdsQueryOptions, o as useSelectedProject } from "./setup-DOEkvnEs.js";
import { t as cbsItemsByL1FilteredQueryOptions } from "./cbs-hpiQf0Mk.js";
import { t as Route } from "./piping-Cf2ubtPn.js";
import { C as useFefTableState, D as TabsList, E as TabsContent, O as TabsTrigger, T as Tabs, _ as FefTableContent, a as LaborFactorCell, b as TAKE_OFF_INITIAL_ROWS, c as RoleSelectCell, d as TaskCodeSelectCell, f as TotalCostCell, g as FIELD_ESTIMATE_INITIAL_ROWS, h as EditableCell, i as toCbsOption, l as ScheduleSelectCell, m as CbsSelectCell, o as LaborHoursCell, p as WeldGroupSelectCell, r as tabTriggerClass, s as PipingSizeCell, t as sumLaborCost, u as ShopFieldSelectCell, v as ReadOnlyCell, w as useTakeOffSync, x as TakeOffIdReadOnlyCell, y as SizeCell } from "./fef-helpers-DzaK2f1D.js";
import { t as setLaborTotal } from "./laborTotalsStore-Ca0P01T2.js";
import { i as AccordionTrigger, n as AccordionContent, r as AccordionItem, t as Accordion } from "./accordion-BW2YBbRe.js";
import * as React$1 from "react";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
//#region src/components/Piping/columns.ts
var columnHelper = createColumnHelper();
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
	columnHelper.accessor("shopField", {
		header: "Shop / Field",
		cell: ShopFieldSelectCell,
		size: 130
	}),
	columnHelper.accessor("weldGroupDescription", {
		header: "Weld Group Description",
		cell: WeldGroupSelectCell,
		size: 220
	}),
	columnHelper.accessor("taskCode", {
		header: "Task Code",
		cell: TaskCodeSelectCell,
		size: 160
	}),
	columnHelper.accessor("quantity", {
		header: "Quantity",
		cell: EditableCell
	}),
	columnHelper.accessor("size", {
		header: "Size",
		cell: PipingSizeCell
	}),
	columnHelper.accessor("unit", {
		header: "Unit",
		cell: ReadOnlyCell
	}),
	columnHelper.display({
		id: "laborFactor",
		header: "Labor Factor",
		cell: LaborFactorCell,
		size: 130
	}),
	columnHelper.accessor("laborHours", {
		header: "Labor Hours",
		cell: LaborHoursCell
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
	columnHelper.accessor("shopField", {
		header: "Shop / Field",
		cell: ShopFieldSelectCell,
		size: 130
	}),
	columnHelper.accessor("weldGroupDescription", {
		header: "Weld Group Description",
		cell: WeldGroupSelectCell,
		size: 220
	}),
	columnHelper.accessor("quantity", {
		header: "Quantity",
		cell: EditableCell
	}),
	columnHelper.accessor("size", {
		header: "Size",
		cell: SizeCell
	}),
	columnHelper.accessor("unit", {
		header: "Unit",
		cell: ReadOnlyCell
	}),
	columnHelper.accessor("metallurgyCode", {
		header: "Metallurgy Code",
		cell: ReadOnlyCell,
		size: 140
	}),
	columnHelper.accessor("boreSize", {
		header: "Bore Size",
		cell: ReadOnlyCell,
		size: 110
	}),
	columnHelper.accessor("laborHours", {
		header: "Labor Hours",
		cell: EditableCell
	}),
	columnHelper.accessor("laborRate", {
		header: "Labor Rate ($)",
		cell: EditableCell
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
var supportLaborColumns = [
	columnHelper.accessor("id", {
		header: "ID",
		cell: EditableCell,
		size: 150
	}),
	columnHelper.accessor("description", {
		header: "Description",
		cell: ReadOnlyCell,
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
		cell: ReadOnlyCell,
		size: 130
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
//#endregion
//#region src/components/PipingTable.tsx
function PipingDisciplinePage({ title, icon: Icon, cbsOptions, pipingGroups, serverPagination, supportLaborInitialRows, roleOptions, scheduleOptions, roleRates, taskCodeOptions, pipingFactors, laborKey }) {
	const weldGroupOptions = React.useMemo(() => Array.from(new Set(pipingGroups.map((g) => g.materialClassification))).sort(), [pipingGroups]);
	const weldGroupMaterialMap = React.useMemo(() => Object.fromEntries(pipingGroups.map((g) => [g.materialClassification, {
		shopCode: g.shopCode,
		installCode: g.installCode
	}])), [pipingGroups]);
	const pipingFactorLookup = React.useMemo(() => {
		const m = /* @__PURE__ */ new Map();
		for (const factor of pipingFactors ?? []) {
			let entry = m.get(factor.code);
			if (!entry) {
				entry = {
					unit: factor.unit,
					values: /* @__PURE__ */ new Map()
				};
				m.set(factor.code, entry);
			}
			for (const v of factor.values) if (v.value !== null && !entry.values.has(v.size)) entry.values.set(v.size, v.value);
		}
		return m;
	}, [pipingFactors]);
	const takeOffState = useFefTableState({ initialRows: TAKE_OFF_INITIAL_ROWS });
	const fieldEstimateState = useFefTableState({ initialRows: FIELD_ESTIMATE_INITIAL_ROWS });
	const supportLaborState = useFefTableState({ initialRows: supportLaborInitialRows });
	const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);
	React.useEffect(() => {
		if (laborKey) setLaborTotal(laborKey, sumLaborCost(fieldEstimateState.data));
		setLaborTotal("craftSupportLabor", sumLaborCost(supportLaborState.data));
	}, [
		laborKey,
		supportLaborState.data,
		fieldEstimateState.data
	]);
	return /* @__PURE__ */ jsxs("main", {
		className: "p-4",
		children: [/* @__PURE__ */ jsxs("h1", {
			className: "text-2xl font-bold mb-4 flex items-center gap-2",
			children: [Icon && /* @__PURE__ */ jsx(Icon, { className: "size-7" }), title]
		}), /* @__PURE__ */ jsxs(Tabs, {
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
						meta: {
							cbsOptions,
							weldGroupOptions,
							weldGroupMaterialMap,
							roleOptions,
							scheduleOptions,
							roleRates,
							taskCodeOptions,
							pipingFactorLookup
						},
						columns: takeOffColumns,
						serverPagination
					})
				}),
				/* @__PURE__ */ jsx(TabsContent, {
					value: "estimate",
					className: "mt-4",
					children: /* @__PURE__ */ jsxs(Accordion, {
						type: "multiple",
						defaultValue: ["support", "craft"],
						children: [/* @__PURE__ */ jsxs(AccordionItem, {
							value: "support",
							children: [/* @__PURE__ */ jsx(AccordionTrigger, { children: "Support Labor" }), /* @__PURE__ */ jsx(AccordionContent, { children: /* @__PURE__ */ jsx(FefTableContent, {
								state: supportLaborState,
								meta: {
									cbsOptions,
									weldGroupOptions,
									weldGroupMaterialMap,
									roleOptions,
									scheduleOptions,
									roleRates
								},
								columns: supportLaborColumns
							}) })]
						}), /* @__PURE__ */ jsxs(AccordionItem, {
							value: "craft",
							children: [/* @__PURE__ */ jsx(AccordionTrigger, { children: "Craft Labor" }), /* @__PURE__ */ jsx(AccordionContent, { children: /* @__PURE__ */ jsx(FefTableContent, {
								state: fieldEstimateState,
								meta: {
									cbsOptions,
									weldGroupOptions,
									weldGroupMaterialMap
								},
								columns: fieldEstimateColumns
							}) })]
						})]
					})
				})
			]
		})]
	});
}
//#endregion
//#region src/routes/piping.tsx?tsr-split=component
var PIPING_L1 = disciplineById.piping.l1Codes;
var PIPING_CRAFT_L1 = PIPING_L1.filter((code) => !code.endsWith("01") && !code.endsWith("31"));
function PipingPage() {
	const { pipingGroups, supportLaborItems, roleOptions, scheduleOptions, roleRates, taskCodeOptions, pipingFactors } = Route.useLoaderData();
	const { projectId } = useSelectedProject();
	const { data: items = [] } = useQuery(cbsItemsByL1FilteredQueryOptions({
		l1Values: PIPING_CRAFT_L1,
		projectId
	}));
	const { data: allowedIds } = useQuery({
		...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
		enabled: projectId !== null
	});
	const allowedIdSet = React$1.useMemo(() => new Set(allowedIds ?? []), [allowedIds]);
	const filteredSupportLaborItems = projectId === null ? supportLaborItems : supportLaborItems.filter((item) => allowedIdSet.has(item.id));
	const cbsOptions = items.map(toCbsOption);
	const supportLaborRows = filteredSupportLaborItems.map((item) => ({
		id: item.displayCode,
		description: item.name ?? "",
		shopField: "",
		weldGroupDescription: "",
		quantity: "",
		size: "",
		unit: item.uom,
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
	}));
	return /* @__PURE__ */ jsx(PipingDisciplinePage, {
		title: "Piping",
		icon: disciplineById.piping.icon,
		cbsOptions,
		pipingGroups,
		supportLaborInitialRows: supportLaborRows,
		roleOptions,
		scheduleOptions,
		roleRates,
		taskCodeOptions,
		pipingFactors,
		laborKey: PIPING_L1[0]?.[0]
	});
}
//#endregion
export { PipingPage as component };
