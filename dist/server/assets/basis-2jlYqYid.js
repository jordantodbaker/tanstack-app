import { t as Input } from "./input-DzVBLfOo.js";
import { t as Label } from "./label-DE_X9-71.js";
import * as React$1 from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/routes/basis.tsx?tsr-split=component
var MILESTONE_EVENTS = [
	"Assess",
	"Select",
	"Define",
	"Detailed Engineering",
	"Construction",
	"Commissioning",
	"Closeout"
];
function diffDays(start, end) {
	if (!start || !end) return null;
	const s = new Date(start);
	const ms = new Date(end).getTime() - s.getTime();
	return Math.round(ms / 864e5);
}
function MilestoneTable() {
	const [rows, setRows] = React$1.useState(MILESTONE_EVENTS.map((event) => ({
		event,
		startDate: "",
		endDate: ""
	})));
	function updateRow(index, field, value) {
		setRows((prev) => prev.map((row, i) => {
			if (i !== index) return row;
			const updated = {
				...row,
				[field]: value
			};
			if (field === "startDate" && updated.endDate && updated.endDate < value) updated.endDate = value;
			if (field === "endDate" && updated.startDate && value < updated.startDate) return row;
			return updated;
		}));
	}
	return /* @__PURE__ */ jsx("div", {
		className: "overflow-x-auto",
		children: /* @__PURE__ */ jsxs("table", {
			className: "w-full border-collapse text-sm",
			children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", {
				className: "bg-gray-100",
				children: [
					/* @__PURE__ */ jsx("th", {
						className: "border border-gray-300 px-3 py-2 text-left font-semibold",
						children: "Event"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "border border-gray-300 px-3 py-2 text-left font-semibold",
						children: "Start Date"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "border border-gray-300 px-3 py-2 text-left font-semibold",
						children: "End Date"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "border border-gray-300 px-3 py-2 text-left font-semibold",
						children: "Days"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "border border-gray-300 px-3 py-2 text-left font-semibold",
						children: "Weeks"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "border border-gray-300 px-3 py-2 text-left font-semibold",
						children: "Months"
					})
				]
			}) }), /* @__PURE__ */ jsx("tbody", { children: rows.map((row, i) => {
				const days = diffDays(row.startDate, row.endDate);
				const weeks = days !== null ? (days / 7).toFixed(1) : "";
				const months = days !== null ? (days / 30.4375).toFixed(1) : "";
				return /* @__PURE__ */ jsxs("tr", {
					className: i % 2 === 0 ? "bg-white" : "bg-gray-50",
					children: [
						/* @__PURE__ */ jsx("td", {
							className: "border border-gray-300 px-3 py-2 font-medium text-slate-700 whitespace-nowrap",
							children: row.event
						}),
						/* @__PURE__ */ jsx("td", {
							className: "border border-gray-300 px-1 py-1",
							children: /* @__PURE__ */ jsx("input", {
								type: "date",
								value: row.startDate,
								onChange: (e) => updateRow(i, "startDate", e.target.value),
								max: row.endDate || void 0,
								className: "w-full px-2 py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
							})
						}),
						/* @__PURE__ */ jsx("td", {
							className: "border border-gray-300 px-1 py-1",
							children: /* @__PURE__ */ jsx("input", {
								type: "date",
								value: row.endDate,
								onChange: (e) => updateRow(i, "endDate", e.target.value),
								min: row.startDate || void 0,
								className: "w-full px-2 py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
							})
						}),
						/* @__PURE__ */ jsx("td", {
							className: "border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600",
							children: days !== null ? days : ""
						}),
						/* @__PURE__ */ jsx("td", {
							className: "border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600",
							children: weeks
						}),
						/* @__PURE__ */ jsx("td", {
							className: "border border-gray-300 px-3 py-2 text-right tabular-nums text-slate-600",
							children: months
						})
					]
				}, row.event);
			}) })]
		})
	});
}
function BasisPage() {
	const [estimateFactor, setEstimateFactor] = React$1.useState("");
	const [compositeLaborRate, setCompositeLaborRate] = React$1.useState("");
	return /* @__PURE__ */ jsxs("main", {
		className: "p-4 max-w-5xl space-y-8",
		children: [
			/* @__PURE__ */ jsx("h1", {
				className: "text-2xl font-bold",
				children: "Basis"
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "space-y-4",
				children: [/* @__PURE__ */ jsx("h2", {
					className: "text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2",
					children: "Estimate Rates & Factors"
				}), /* @__PURE__ */ jsxs("div", {
					className: "grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "space-y-1",
						children: [/* @__PURE__ */ jsx(Label, {
							htmlFor: "estimate-factor",
							children: "Estimate Factor / Basis"
						}), /* @__PURE__ */ jsx(Input, {
							id: "estimate-factor",
							type: "number",
							step: "any",
							value: estimateFactor,
							onChange: (e) => setEstimateFactor(e.target.value),
							placeholder: "0.00"
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "space-y-1",
						children: [/* @__PURE__ */ jsx(Label, {
							htmlFor: "composite-labor-rate",
							children: "Composite Labor Rate"
						}), /* @__PURE__ */ jsx(Input, {
							id: "composite-labor-rate",
							type: "number",
							step: "any",
							value: compositeLaborRate,
							onChange: (e) => setCompositeLaborRate(e.target.value),
							placeholder: "0.00"
						})]
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "space-y-4",
				children: [/* @__PURE__ */ jsx("h2", {
					className: "text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2",
					children: "Schedule Information / Milestones"
				}), /* @__PURE__ */ jsx(MilestoneTable, {})]
			})
		]
	});
}
//#endregion
export { BasisPage as component };
