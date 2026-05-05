import { i as createServerFn } from "../server.js";
/* empty css             */
import { n as createServerRpc, t as prisma } from "./db-DfunTdmd.js";
//#region src/routes/index.tsx?tss-serverfn-split
var getChangelogs_createServerFn_handler = createServerRpc({
	id: "855d84ae08da5d34a6b92ee381162a6c87b1b5d11addd4470c8e8c13f4d10aa5",
	name: "getChangelogs",
	filename: "src/routes/index.tsx"
}, (opts) => getChangelogs.__executeServer(opts));
var getChangelogs = createServerFn({ method: "GET" }).handler(getChangelogs_createServerFn_handler, async () => {
	return {
		changeLogs: await prisma.changeLog.findMany({ include: { status: true } }),
		statusLookup: await prisma.statusLookup.findMany()
	};
});
var updateChangelogs_createServerFn_handler = createServerRpc({
	id: "a848c26e53e67cea4bb685d2edcfd894fa51aea235caef9d348961ba2107e444",
	name: "updateChangelogs",
	filename: "src/routes/index.tsx"
}, (opts) => updateChangelogs.__executeServer(opts));
var updateChangelogs = createServerFn({ method: "POST" }).inputValidator((data) => data).handler(updateChangelogs_createServerFn_handler, async (data) => {
	const logs = data.data;
	return await Promise.all(logs.map((log) => {
		if (log.isDirty) return prisma.changeLog.update({
			where: { id: log.id },
			data: {
				projectId: log.projectId,
				cvrId: log.cvrId,
				description: log.description,
				statusId: +log.statusId,
				updatedAt: /* @__PURE__ */ new Date()
			}
		});
	}));
});
var addChangelog_createServerFn_handler = createServerRpc({
	id: "6ded4409a5b599a60a06f320bea1418fe83b4153dbc8ce87daf919f040a51c06",
	name: "addChangelog",
	filename: "src/routes/index.tsx"
}, (opts) => addChangelog.__executeServer(opts));
var addChangelog = createServerFn({ method: "POST" }).inputValidator((data) => data).handler(addChangelog_createServerFn_handler, async (data) => {
	const log = data.data;
	return await prisma.changeLog.create({ data: {
		projectId: log.projectId,
		cvrId: log.cvrId,
		description: log.description,
		statusId: +log.statusId,
		updatedAt: /* @__PURE__ */ new Date()
	} });
});
var deleteChangelog_createServerFn_handler = createServerRpc({
	id: "aacd2986ec9cbe2f474481bca018f9786020d2fcffb65c0660b6e44d1abc0bef",
	name: "deleteChangelog",
	filename: "src/routes/index.tsx"
}, (opts) => deleteChangelog.__executeServer(opts));
var deleteChangelog = createServerFn({ method: "POST" }).inputValidator((data) => data).handler(deleteChangelog_createServerFn_handler, async (data) => {
	return await prisma.changeLog.delete({ where: { id: data.data.id } });
});
//#endregion
export { addChangelog_createServerFn_handler, deleteChangelog_createServerFn_handler, getChangelogs_createServerFn_handler, updateChangelogs_createServerFn_handler };
