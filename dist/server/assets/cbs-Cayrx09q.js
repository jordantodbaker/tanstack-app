import { i as createServerFn } from "../server.js";
import { n as createServerRpc, t as prisma } from "./db-DfunTdmd.js";
//#region src/utils/cbs.ts?tss-serverfn-split
var fetchCbsItems_createServerFn_handler = createServerRpc({
	id: "96f671ef132c4c9bc06fdbbb37eada8785fc163c56be4f43dca7b822d52a70ea",
	name: "fetchCbsItems",
	filename: "src/utils/cbs.ts"
}, (opts) => fetchCbsItems.__executeServer(opts));
var fetchCbsItems = createServerFn({ method: "GET" }).handler(fetchCbsItems_createServerFn_handler, () => {
	return prisma.cbsItem.findMany({ orderBy: { id: "asc" } });
});
var fetchCbsItemsByL1_createServerFn_handler = createServerRpc({
	id: "d58d2cd0b99d419847ac51263af81fe9a7e64580c99178a4b4c2d6d7316d4664",
	name: "fetchCbsItemsByL1",
	filename: "src/utils/cbs.ts"
}, (opts) => fetchCbsItemsByL1.__executeServer(opts));
var fetchCbsItemsByL1 = createServerFn({ method: "GET" }).inputValidator((l1Values) => l1Values).handler(fetchCbsItemsByL1_createServerFn_handler, ({ data }) => {
	return prisma.cbsItem.findMany({
		where: { l1: { in: data } },
		orderBy: { id: "asc" }
	});
});
var fetchCbsItemsByL1Paged_createServerFn_handler = createServerRpc({
	id: "32446a2c9e7f55b7da15d8ad4704f2d196c9841c1188a7c0e1362d153ea0e5e3",
	name: "fetchCbsItemsByL1Paged",
	filename: "src/utils/cbs.ts"
}, (opts) => fetchCbsItemsByL1Paged.__executeServer(opts));
var fetchCbsItemsByL1Paged = createServerFn({ method: "GET" }).inputValidator((input) => input).handler(fetchCbsItemsByL1Paged_createServerFn_handler, async ({ data }) => {
	const { l1Values, page, pageSize, projectId } = data;
	const where = projectId != null ? {
		l1: { in: l1Values },
		allowedInProjects: { some: { id: projectId } }
	} : { l1: { in: l1Values } };
	const [items, total] = await Promise.all([prisma.cbsItem.findMany({
		where,
		orderBy: { id: "asc" },
		skip: page * pageSize,
		take: pageSize,
		select: {
			id: true,
			displayCode: true,
			name: true,
			uom: true,
			displayDescription: true
		}
	}), prisma.cbsItem.count({ where })]);
	return {
		items,
		total
	};
});
var fetchCbsItemsByL1Filtered_createServerFn_handler = createServerRpc({
	id: "e0b17fee7856b550a9119b9640848e3dad4c008f12a020f65b037ef56a380f1b",
	name: "fetchCbsItemsByL1Filtered",
	filename: "src/utils/cbs.ts"
}, (opts) => fetchCbsItemsByL1Filtered.__executeServer(opts));
var fetchCbsItemsByL1Filtered = createServerFn({ method: "GET" }).inputValidator((input) => input).handler(fetchCbsItemsByL1Filtered_createServerFn_handler, ({ data }) => {
	const { l1Values, projectId } = data;
	const where = projectId != null ? {
		l1: { in: l1Values },
		allowedInProjects: { some: { id: projectId } }
	} : { l1: { in: l1Values } };
	return prisma.cbsItem.findMany({
		where,
		orderBy: { id: "asc" },
		select: {
			id: true,
			displayCode: true,
			costCode: true,
			name: true,
			uom: true,
			displayDescription: true
		}
	});
});
var fetchCbsItemsByL1EndsWith_createServerFn_handler = createServerRpc({
	id: "b744cacc202acc9915654ec1b006a3bd6678f21ef6a5ee1675011d370d9f3410",
	name: "fetchCbsItemsByL1EndsWith",
	filename: "src/utils/cbs.ts"
}, (opts) => fetchCbsItemsByL1EndsWith.__executeServer(opts));
var fetchCbsItemsByL1EndsWith = createServerFn({ method: "GET" }).inputValidator((suffixes) => suffixes).handler(fetchCbsItemsByL1EndsWith_createServerFn_handler, ({ data }) => {
	return prisma.cbsItem.findMany({
		where: { OR: data.map((suffix) => ({ l1: { endsWith: suffix } })) },
		orderBy: { id: "asc" },
		select: {
			id: true,
			displayCode: true,
			name: true,
			uom: true,
			displayDescription: true,
			l1: true,
			accountDescription: true
		}
	});
});
//#endregion
export { fetchCbsItemsByL1EndsWith_createServerFn_handler, fetchCbsItemsByL1Filtered_createServerFn_handler, fetchCbsItemsByL1Paged_createServerFn_handler, fetchCbsItemsByL1_createServerFn_handler, fetchCbsItems_createServerFn_handler };
