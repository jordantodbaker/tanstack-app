import { i as createServerFn } from "../server.js";
import { n as createServerRpc, t as prisma } from "./db-DfunTdmd.js";
//#region src/utils/roles.ts?tss-serverfn-split
var fetchRoleOptions_createServerFn_handler = createServerRpc({
	id: "2d6ccb73ed96e86de31e6cf77ed5315537d50e89c50ad47dd53bba86207ea242",
	name: "fetchRoleOptions",
	filename: "src/utils/roles.ts"
}, (opts) => fetchRoleOptions.__executeServer(opts));
var fetchRoleOptions = createServerFn({ method: "GET" }).handler(fetchRoleOptions_createServerFn_handler, async () => {
	return (await prisma.role.findMany({
		select: { name: true },
		orderBy: { name: "asc" }
	})).map((r) => r.name);
});
var fetchScheduleOptions_createServerFn_handler = createServerRpc({
	id: "0295d564bff697b1dd9cd4f6417e21e0d2a39fbff2a4ab33fda1a4be3c474407",
	name: "fetchScheduleOptions",
	filename: "src/utils/roles.ts"
}, (opts) => fetchScheduleOptions.__executeServer(opts));
var fetchScheduleOptions = createServerFn({ method: "GET" }).handler(fetchScheduleOptions_createServerFn_handler, async () => {
	return (await prisma.roleRate.findMany({
		select: { schedule: true },
		distinct: ["schedule"],
		orderBy: { schedule: "asc" }
	})).map((r) => r.schedule);
});
var fetchRoleRates_createServerFn_handler = createServerRpc({
	id: "f161fa5ba2647482742985e4af52e5564f511834bb3ff9b004fac84bedaf67c0",
	name: "fetchRoleRates",
	filename: "src/utils/roles.ts"
}, (opts) => fetchRoleRates.__executeServer(opts));
var fetchRoleRates = createServerFn({ method: "GET" }).handler(fetchRoleRates_createServerFn_handler, async () => {
	return (await prisma.roleRate.findMany({
		include: { role: { select: { name: true } } },
		orderBy: [{ role: { name: "asc" } }, { schedule: "asc" }]
	})).map((r) => ({
		roleName: r.role.name,
		schedule: r.schedule,
		rate: r.rate
	}));
});
//#endregion
export { fetchRoleOptions_createServerFn_handler, fetchRoleRates_createServerFn_handler, fetchScheduleOptions_createServerFn_handler };
