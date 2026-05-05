import { t as DISCIPLINE_LABELS } from "./disciplines-D-_GrFF6.js";
import { n as useLaborTotals, o as useMaterialsTotalsByFirstDigit } from "./laborTotalsStore-Ca0P01T2.js";
import { n as formatMoney, t as formatCompact } from "./formatting-BWuxLbDU.js";
import "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/routes/validation.tsx?tsr-split=component
function polarToCartesian(cx, cy, r, angleDeg) {
	const rad = (angleDeg - 90) * Math.PI / 180;
	return {
		x: cx + r * Math.cos(rad),
		y: cy + r * Math.sin(rad)
	};
}
function DonutChart({ slices, total }) {
	const cx = 130;
	const cy = 130;
	const R = 105;
	const innerR = 62;
	const size = 260;
	if (total === 0) return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: `0 0 ${size} ${size}`,
		children: [/* @__PURE__ */ jsx("circle", {
			cx,
			cy,
			r: R,
			fill: "none",
			stroke: "#e2e8f0",
			strokeWidth: R - innerR
		}), /* @__PURE__ */ jsx("text", {
			x: cx,
			y: cy - 6,
			textAnchor: "middle",
			fill: "#94a3b8",
			fontSize: "11",
			children: "No data yet"
		})]
	});
	let cursor = 0;
	const paths = slices.filter((s) => s.value > 0).map((s) => {
		const sweep = s.value / total * 360;
		const start = cursor;
		const end = cursor + sweep;
		cursor = end;
		if (sweep >= 359.99) return /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("circle", {
			cx,
			cy,
			r: R,
			fill: s.color
		}), /* @__PURE__ */ jsx("circle", {
			cx,
			cy,
			r: innerR,
			fill: "white"
		})] }, s.label);
		const s1 = polarToCartesian(cx, cy, R, start);
		const e1 = polarToCartesian(cx, cy, R, end);
		const s2 = polarToCartesian(cx, cy, innerR, end);
		const e2 = polarToCartesian(cx, cy, innerR, start);
		const large = sweep > 180 ? 1 : 0;
		return /* @__PURE__ */ jsx("path", {
			d: [
				`M ${s1.x} ${s1.y}`,
				`A ${R} ${R} 0 ${large} 1 ${e1.x} ${e1.y}`,
				`L ${s2.x} ${s2.y}`,
				`A ${innerR} ${innerR} 0 ${large} 0 ${e2.x} ${e2.y}`,
				"Z"
			].join(" "),
			fill: s.color
		}, s.label);
	});
	return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: `0 0 ${size} ${size}`,
		children: [
			paths,
			/* @__PURE__ */ jsx("circle", {
				cx,
				cy,
				r: innerR,
				fill: "white"
			}),
			/* @__PURE__ */ jsx("text", {
				x: cx,
				y: cy - 10,
				textAnchor: "middle",
				fill: "#6b7280",
				fontSize: "11",
				children: "Grand Total"
			}),
			/* @__PURE__ */ jsx("text", {
				x: cx,
				y: cy + 10,
				textAnchor: "middle",
				fill: "#111827",
				fontSize: "15",
				fontWeight: "700",
				children: formatCompact(total)
			})
		]
	});
}
var DISC_COLOR = "#a63434";
var INDI_COLOR = "#1e40af";
var MATERIAL_COLOR = "#6b7280";
function StatCard({ label, value, color }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
		children: [/* @__PURE__ */ jsx("p", {
			className: "text-sm text-slate-500",
			children: label
		}), /* @__PURE__ */ jsx("p", {
			className: "mt-1 text-2xl font-bold",
			style: { color },
			children: value > 0 ? `$${formatMoney(value)}` : "—"
		})]
	});
}
function ValidationPage() {
	const materialsByDigit = useMaterialsTotalsByFirstDigit();
	const laborTotals = useLaborTotals();
	const disciplineData = DISCIPLINE_LABELS.map((label, i) => {
		const labor = laborTotals.get(String(i)) ?? 0;
		const material = materialsByDigit.get(String(i)) ?? 0;
		return {
			label,
			labor,
			material,
			total: labor + material
		};
	});
	const disciplinesTotal = disciplineData.reduce((acc, d) => acc + d.total, 0);
	const craftSupportTotal = laborTotals.get("craftSupportLabor") ?? 0;
	const indirectsTotal = craftSupportTotal;
	const grandTotal = disciplinesTotal + indirectsTotal;
	const maxBar = Math.max(...disciplineData.map((d) => d.total), indirectsTotal, 1);
	const donutSlices = [{
		label: "Disciplines",
		value: disciplinesTotal,
		color: DISC_COLOR
	}, {
		label: "Indirects",
		value: indirectsTotal,
		color: INDI_COLOR
	}];
	return /* @__PURE__ */ jsxs("main", {
		className: "p-4 max-w-5xl space-y-8",
		children: [
			/* @__PURE__ */ jsx("h1", {
				className: "text-2xl font-bold",
				children: "Validation"
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "grid grid-cols-1 sm:grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ jsx(StatCard, {
						label: "Disciplines Total Cost",
						value: disciplinesTotal,
						color: DISC_COLOR
					}),
					/* @__PURE__ */ jsx(StatCard, {
						label: "Indirects Total Cost",
						value: indirectsTotal,
						color: INDI_COLOR
					}),
					/* @__PURE__ */ jsx(StatCard, {
						label: "Grand Total",
						value: grandTotal,
						color: "#111827"
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "rounded-lg border border-slate-200 bg-white p-6 shadow-sm",
				children: [/* @__PURE__ */ jsx("h2", {
					className: "text-lg font-semibold text-slate-800 mb-4",
					children: "Disciplines vs. Indirects"
				}), /* @__PURE__ */ jsxs("div", {
					className: "flex flex-col sm:flex-row items-center gap-10",
					children: [/* @__PURE__ */ jsx(DonutChart, {
						slices: donutSlices,
						total: grandTotal
					}), /* @__PURE__ */ jsx("div", {
						className: "space-y-5 min-w-48",
						children: donutSlices.map(({ label, value, color }) => {
							const pct = grandTotal > 0 ? (value / grandTotal * 100).toFixed(1) : "0.0";
							return /* @__PURE__ */ jsxs("div", {
								className: "flex items-start gap-3",
								children: [/* @__PURE__ */ jsx("span", {
									className: "mt-1 inline-block h-3 w-3 shrink-0 rounded-full",
									style: { background: color }
								}), /* @__PURE__ */ jsxs("div", { children: [
									/* @__PURE__ */ jsx("p", {
										className: "text-sm font-semibold text-slate-700",
										children: label
									}),
									/* @__PURE__ */ jsx("p", {
										className: "text-sm text-slate-500",
										children: value > 0 ? `$${formatMoney(value)}` : "—"
									}),
									/* @__PURE__ */ jsxs("p", {
										className: "text-xs text-slate-400",
										children: [pct, "% of total"]
									})
								] })]
							}, label);
						})
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "rounded-lg border border-slate-200 bg-white p-6 shadow-sm",
				children: [
					/* @__PURE__ */ jsx("h2", {
						className: "text-lg font-semibold text-slate-800 mb-1",
						children: "Discipline Breakdown"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "text-sm text-slate-500 mb-5",
						children: "Labor and material costs per discipline"
					}),
					disciplinesTotal === 0 && indirectsTotal === 0 ? /* @__PURE__ */ jsx("p", {
						className: "text-sm text-slate-400",
						children: "No cost data recorded yet. Enter labor hours, rates, and material costs on the discipline pages."
					}) : /* @__PURE__ */ jsxs("div", {
						className: "space-y-3",
						children: [[...disciplineData.filter((d) => d.total > 0), ...indirectsTotal > 0 ? [{
							label: "Craft Support Labor (Indirect)",
							labor: craftSupportTotal,
							material: 0,
							total: craftSupportTotal
						}] : []].map((d) => {
							const isIndirect = d.label.includes("Indirect");
							const laborWidth = d.labor / maxBar * 100;
							const materialWidth = d.material / maxBar * 100;
							return /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("div", {
								className: "flex justify-between text-sm mb-1",
								children: [/* @__PURE__ */ jsx("span", {
									className: "font-medium",
									style: { color: isIndirect ? INDI_COLOR : "#374151" },
									children: d.label
								}), /* @__PURE__ */ jsxs("span", {
									className: "text-slate-500 tabular-nums",
									children: ["$", formatMoney(d.total)]
								})]
							}), /* @__PURE__ */ jsxs("div", {
								className: "flex h-5 w-full overflow-hidden rounded bg-slate-100",
								children: [d.labor > 0 && /* @__PURE__ */ jsx("div", {
									className: "h-full transition-all",
									style: {
										width: `${laborWidth}%`,
										background: isIndirect ? INDI_COLOR : DISC_COLOR
									},
									title: `Labor: $${formatMoney(d.labor)}`
								}), d.material > 0 && /* @__PURE__ */ jsx("div", {
									className: "h-full transition-all",
									style: {
										width: `${materialWidth}%`,
										background: MATERIAL_COLOR
									},
									title: `Material: $${formatMoney(d.material)}`
								})]
							})] }, d.label);
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex gap-5 pt-2 text-xs text-slate-500",
							children: [
								/* @__PURE__ */ jsxs("span", {
									className: "flex items-center gap-1.5",
									children: [/* @__PURE__ */ jsx("span", {
										className: "inline-block h-2.5 w-2.5 rounded-sm",
										style: { background: DISC_COLOR }
									}), "Discipline Labor"]
								}),
								/* @__PURE__ */ jsxs("span", {
									className: "flex items-center gap-1.5",
									children: [/* @__PURE__ */ jsx("span", {
										className: "inline-block h-2.5 w-2.5 rounded-sm",
										style: { background: MATERIAL_COLOR }
									}), "Material"]
								}),
								/* @__PURE__ */ jsxs("span", {
									className: "flex items-center gap-1.5",
									children: [/* @__PURE__ */ jsx("span", {
										className: "inline-block h-2.5 w-2.5 rounded-sm",
										style: { background: INDI_COLOR }
									}), "Indirect Labor"]
								})
							]
						})]
					})
				]
			})
		]
	});
}
//#endregion
export { ValidationPage as component };
