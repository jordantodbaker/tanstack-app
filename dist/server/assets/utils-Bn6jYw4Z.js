import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
//#region src/lib/utils.ts
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function computeBoreSize(size) {
	const n = parseFloat(size);
	if (!size || isNaN(n)) return "";
	if (n < 3) return "SB";
	if (n <= 12) return "MB";
	if (n <= 24) return "LB";
	return "XB";
}
//#endregion
export { computeBoreSize as n, cn as t };
