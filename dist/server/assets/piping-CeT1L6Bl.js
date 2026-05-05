import { i as createServerFn } from "../server.js";
import { n as createServerRpc, t as prisma } from "./db-DfunTdmd.js";
//#region src/utils/piping.ts?tss-serverfn-split
var fetchPipingGroups_createServerFn_handler = createServerRpc({
	id: "4b879ed8647ff3b579e4d1a65d94310a9c73f57d9bc16223870f57475d11d11a",
	name: "fetchPipingGroups",
	filename: "src/utils/piping.ts"
}, (opts) => fetchPipingGroups.__executeServer(opts));
var fetchPipingGroups = createServerFn({ method: "GET" }).handler(fetchPipingGroups_createServerFn_handler, () => {
	return prisma.pipingGroup.findMany({
		include: { values: { orderBy: { size: "asc" } } },
		orderBy: { groupNo: "asc" }
	});
});
var fetchPipingFactorCodes_createServerFn_handler = createServerRpc({
	id: "8ccc46a1c795069432f95cd945b6b9102a3c033e8081b448af7e25596c6ba993",
	name: "fetchPipingFactorCodes",
	filename: "src/utils/piping.ts"
}, (opts) => fetchPipingFactorCodes.__executeServer(opts));
var fetchPipingFactorCodes = createServerFn({ method: "GET" }).handler(fetchPipingFactorCodes_createServerFn_handler, async () => {
	return (await prisma.pipingFactor.findMany({
		select: { code: true },
		distinct: ["code"],
		orderBy: { code: "asc" }
	})).map((r) => r.code);
});
var fetchPipingFactors_createServerFn_handler = createServerRpc({
	id: "1fc43d4c16672dab701445d89a89594921067cd8a0514da62d904ef89ba04492",
	name: "fetchPipingFactors",
	filename: "src/utils/piping.ts"
}, (opts) => fetchPipingFactors.__executeServer(opts));
var fetchPipingFactors = createServerFn({ method: "GET" }).handler(fetchPipingFactors_createServerFn_handler, () => {
	return prisma.pipingFactor.findMany({ select: {
		code: true,
		unit: true,
		values: { select: {
			size: true,
			value: true
		} }
	} });
});
//#endregion
export { fetchPipingFactorCodes_createServerFn_handler, fetchPipingFactors_createServerFn_handler, fetchPipingGroups_createServerFn_handler };
