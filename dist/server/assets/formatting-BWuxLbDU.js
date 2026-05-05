//#region src/lib/formatting.ts
function formatMoney(n) {
	return n.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}
function formatCompact(n) {
	if (n === 0) return "$0";
	if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
	if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
	return `$${formatMoney(n)}`;
}
//#endregion
export { formatMoney as n, formatCompact as t };
