import { t as DISCIPLINE_LABELS } from "./disciplines-D-_GrFF6.js";
import { n as useLaborTotals, o as useMaterialsTotalsByFirstDigit } from "./laborTotalsStore-Ca0P01T2.js";
import { i as AccordionTrigger, n as AccordionContent, r as AccordionItem, t as Accordion } from "./accordion-BW2YBbRe.js";
import { n as formatMoney } from "./formatting-BWuxLbDU.js";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/routes/summary.tsx?tsr-split=component
var INDIRECTS = [
	"Haskell Field Staff",
	"Supervision",
	"Office Staff",
	"Craft Support Labor",
	"Construction Equipment",
	"Haskell Owned",
	"3rd Party",
	"Facilities",
	"Heavy Haul / Crane",
	"Survey & NDE Services",
	"Training & Testing",
	"Mobilize / Demobilize",
	"Other Services"
];
var emptyRow = () => ({
	qty: "",
	uom: "",
	unitRate: "",
	hrs: "",
	rate: "",
	totalLabor: "",
	material: "",
	sub: "",
	equip: "",
	other: ""
});
function makeRows(descriptions) {
	return descriptions.map((d) => ({
		description: d,
		...emptyRow()
	}));
}
function parseMoney(s) {
	return parseFloat(s.replace(/,/g, ""));
}
function totalCost(row) {
	const values = [
		parseMoney(row.totalLabor),
		parseMoney(row.material),
		parseMoney(row.sub),
		parseMoney(row.equip),
		parseMoney(row.other)
	];
	if (values.every(isNaN)) return "";
	return values.reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}
var columns = [
	{
		key: "description",
		header: "Description",
		width: "w-48"
	},
	{
		key: "qty",
		header: "QTY",
		width: "w-20"
	},
	{
		key: "uom",
		header: "UOM",
		width: "w-20"
	},
	{
		key: "unitRate",
		header: "Unit Rate",
		width: "w-24",
		currency: true
	},
	{
		key: "hrs",
		header: "HRS",
		width: "w-20"
	},
	{
		key: "rate",
		header: "Rate",
		width: "w-20",
		currency: true
	},
	{
		key: "totalLabor",
		header: "Total Labor $",
		width: "w-28",
		currency: true
	},
	{
		key: "material",
		header: "Material $",
		width: "w-24",
		currency: true
	},
	{
		key: "sub",
		header: "Sub $",
		width: "w-20",
		currency: true
	},
	{
		key: "equip",
		header: "Equip $",
		width: "w-20",
		currency: true
	},
	{
		key: "other",
		header: "Other $",
		width: "w-20",
		currency: true
	},
	{
		key: "totalCost",
		header: "Total Cost $",
		width: "w-28",
		currency: true
	}
];
function SummaryTable({ rows }) {
	return /* @__PURE__ */ jsx("div", {
		className: "overflow-x-auto",
		children: /* @__PURE__ */ jsxs("table", {
			className: "w-full border-collapse text-sm",
			children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", {
				className: "bg-gray-100 border-b border-gray-300",
				children: columns.map((col) => /* @__PURE__ */ jsx("th", {
					className: `${col.width} px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 whitespace-nowrap`,
					children: col.header
				}, col.key))
			}) }), /* @__PURE__ */ jsx("tbody", { children: rows.map((row) => /* @__PURE__ */ jsx("tr", {
				className: "border-b border-gray-200",
				children: columns.map((col) => {
					if (col.key === "description") return /* @__PURE__ */ jsx("td", {
						className: "px-3 py-1.5 border border-gray-200 font-medium text-gray-800 whitespace-nowrap",
						children: row.description
					}, col.key);
					const value = col.key === "totalCost" ? totalCost(row) : row[col.key];
					return /* @__PURE__ */ jsx("td", {
						className: "px-3 py-1.5 border border-gray-200 text-right text-slate-500 bg-slate-100",
						children: col.currency && value ? `$${value}` : value
					}, col.key);
				})
			}, row.description)) })]
		})
	});
}
function SummaryPage() {
	const materialsByDigit = useMaterialsTotalsByFirstDigit();
	const laborTotals = useLaborTotals();
	const disciplineRows = DISCIPLINE_LABELS.map((label, i) => {
		const materialTotal = materialsByDigit.get(String(i)) ?? 0;
		const laborTotal = laborTotals.get(String(i)) ?? 0;
		return {
			description: label,
			...emptyRow(),
			material: materialTotal > 0 ? formatMoney(materialTotal) : "",
			totalLabor: laborTotal > 0 ? formatMoney(laborTotal) : ""
		};
	});
	const craftSupportTotal = laborTotals.get("craftSupportLabor") ?? 0;
	const indirectRows = makeRows(INDIRECTS).map((row) => {
		if (row.description === "Craft Support Labor" && craftSupportTotal > 0) return {
			...row,
			totalLabor: formatMoney(craftSupportTotal)
		};
		return row;
	});
	return /* @__PURE__ */ jsxs("main", {
		className: "p-4",
		children: [/* @__PURE__ */ jsx("h1", {
			className: "text-2xl font-bold mb-4",
			children: "Summary"
		}), /* @__PURE__ */ jsxs(Accordion, {
			type: "multiple",
			defaultValue: ["disciplines", "indirects"],
			children: [/* @__PURE__ */ jsxs(AccordionItem, {
				value: "disciplines",
				children: [/* @__PURE__ */ jsx(AccordionTrigger, { children: "Disciplines" }), /* @__PURE__ */ jsx(AccordionContent, { children: /* @__PURE__ */ jsx(SummaryTable, { rows: disciplineRows }) })]
			}), /* @__PURE__ */ jsxs(AccordionItem, {
				value: "indirects",
				children: [/* @__PURE__ */ jsx(AccordionTrigger, { children: "Indirects" }), /* @__PURE__ */ jsx(AccordionContent, { children: /* @__PURE__ */ jsx(SummaryTable, { rows: indirectRows }) })]
			})]
		})]
	});
}
//#endregion
export { SummaryPage as component };
