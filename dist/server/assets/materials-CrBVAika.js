import { n as disciplineById } from "./disciplines-D-_GrFF6.js";
import { n as allowedFefCbsItemIdsQueryOptions, o as useSelectedProject } from "./setup-DOEkvnEs.js";
import { t as Route } from "./materials-PTpqgOfC.js";
import { i as toCbsOption } from "./fef-helpers-DzaK2f1D.js";
import { t as DisciplinePage } from "./FefTable-D0mc4DKi.js";
import { i as AccordionTrigger, n as AccordionContent, r as AccordionItem, t as Accordion } from "./accordion-BW2YBbRe.js";
import { useMemo } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
//#region src/routes/materials.tsx?tsr-split=component
var MaterialsIcon = disciplineById.materials.icon;
function MaterialsPage() {
	const cbsItems = Route.useLoaderData();
	const { projectId } = useSelectedProject();
	const { data: allowedIds } = useQuery({
		...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
		enabled: projectId !== null
	});
	const allowedIdSet = useMemo(() => new Set(allowedIds ?? []), [allowedIds]);
	const sections = useMemo(() => {
		const visibleItems = projectId === null ? cbsItems : cbsItems.filter((item) => allowedIdSet.has(item.id));
		const groups = /* @__PURE__ */ new Map();
		for (const item of visibleItems) {
			if (!groups.has(item.l1)) groups.set(item.l1, []);
			groups.get(item.l1).push(item);
		}
		return [...groups.keys()].sort().map((key) => {
			const items = groups.get(key);
			return {
				key,
				title: items[0].accountDescription ?? key,
				cbsOptions: items.map(toCbsOption),
				rows: items.map((item) => ({
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
				}))
			};
		});
	}, [
		cbsItems,
		projectId,
		allowedIdSet
	]);
	return /* @__PURE__ */ jsxs("main", {
		className: "p-3 md:p-4",
		children: [/* @__PURE__ */ jsxs("h1", {
			className: "text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2",
			children: [/* @__PURE__ */ jsx(MaterialsIcon, { className: "size-6 md:size-7" }), "Materials"]
		}), sections.length === 0 ? /* @__PURE__ */ jsx("p", {
			className: "text-sm text-slate-500",
			children: "No materials are enabled for the selected project. Enable material CBS items on the Setup page."
		}) : /* @__PURE__ */ jsx(Accordion, {
			type: "multiple",
			defaultValue: [],
			children: sections.map((section) => /* @__PURE__ */ jsxs(AccordionItem, {
				value: section.key,
				children: [/* @__PURE__ */ jsx(AccordionTrigger, { children: section.title }), /* @__PURE__ */ jsx(AccordionContent, { children: /* @__PURE__ */ jsx(DisciplinePage, {
					initialRows: section.rows,
					cbsOptions: section.cbsOptions,
					variant: "materials",
					sectionKey: section.key
				}) })]
			}, section.key))
		})]
	});
}
//#endregion
export { MaterialsPage as component };
