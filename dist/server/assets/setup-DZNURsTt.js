import { i as createServerFn } from "../server.js";
import { n as createServerRpc, t as prisma } from "./db-DfunTdmd.js";
//#region src/utils/setup.ts?tss-serverfn-split
var fetchSetupCbsItems_createServerFn_handler = createServerRpc({
	id: "ac70d93935982bff82e1584802125b27955cadf6222b0dffb4eae3e53dd44311",
	name: "fetchSetupCbsItems",
	filename: "src/utils/setup.ts"
}, (opts) => fetchSetupCbsItems.__executeServer(opts));
var fetchSetupCbsItems = createServerFn({ method: "GET" }).handler(fetchSetupCbsItems_createServerFn_handler, () => prisma.cbsItem.findMany({
	orderBy: { displayCode: "asc" },
	select: {
		id: true,
		l1: true,
		l2: true,
		l3: true,
		l4: true,
		l5: true,
		l6: true,
		displayCode: true,
		name: true,
		accountDescription: true,
		l2Description: true,
		uom: true
	}
}));
var fetchAllowedFefCbsItemIds_createServerFn_handler = createServerRpc({
	id: "e0daf57febeed21409b1a91876e353d1970a1426d81604b19bb7edc23de84811",
	name: "fetchAllowedFefCbsItemIds",
	filename: "src/utils/setup.ts"
}, (opts) => fetchAllowedFefCbsItemIds.__executeServer(opts));
var fetchAllowedFefCbsItemIds = createServerFn({ method: "GET" }).inputValidator((projectId) => projectId).handler(fetchAllowedFefCbsItemIds_createServerFn_handler, async ({ data: projectId }) => {
	return (await prisma.project.findUnique({
		where: { id: projectId },
		select: { allowedFefCbsItems: { select: { id: true } } }
	}))?.allowedFefCbsItems.map((i) => i.id) ?? [];
});
var fetchAllowedCbsL1Codes_createServerFn_handler = createServerRpc({
	id: "bd3fbad6a6d35af36efaee5d39e6060b21a7552ac51838b7689529a68cd0d938",
	name: "fetchAllowedCbsL1Codes",
	filename: "src/utils/setup.ts"
}, (opts) => fetchAllowedCbsL1Codes.__executeServer(opts));
var fetchAllowedCbsL1Codes = createServerFn({ method: "GET" }).inputValidator((projectId) => projectId).handler(fetchAllowedCbsL1Codes_createServerFn_handler, async ({ data: projectId }) => {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { allowedFefCbsItems: { select: { l1: true } } }
	});
	if (!project) return [];
	const set = /* @__PURE__ */ new Set();
	for (const item of project.allowedFefCbsItems) set.add(item.l1);
	return Array.from(set);
});
var updateAllowedFefCbsItems_createServerFn_handler = createServerRpc({
	id: "b273dc4d40f588922f9e36b42588cba9f18492cdff9a9016b22ebb9823b44aef",
	name: "updateAllowedFefCbsItems",
	filename: "src/utils/setup.ts"
}, (opts) => updateAllowedFefCbsItems.__executeServer(opts));
var updateAllowedFefCbsItems = createServerFn({ method: "POST" }).inputValidator((input) => input).handler(updateAllowedFefCbsItems_createServerFn_handler, async ({ data }) => {
	const { projectId, addIds, removeIds } = data;
	if (addIds.length === 0 && removeIds.length === 0) return { ok: true };
	await prisma.project.update({
		where: { id: projectId },
		data: { allowedFefCbsItems: {
			connect: addIds.map((id) => ({ id })),
			disconnect: removeIds.map((id) => ({ id }))
		} }
	});
	return { ok: true };
});
//#endregion
export { fetchAllowedCbsL1Codes_createServerFn_handler, fetchAllowedFefCbsItemIds_createServerFn_handler, fetchSetupCbsItems_createServerFn_handler, updateAllowedFefCbsItems_createServerFn_handler };
