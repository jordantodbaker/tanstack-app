import { i as createServerFn } from "../server.js";
import { n as createServerRpc, t as prisma } from "./db-DfunTdmd.js";
//#region src/utils/projects.ts?tss-serverfn-split
var fetchProjects_createServerFn_handler = createServerRpc({
	id: "ffc8c2852feac952298200193c68aabf5a14e581c7b233e828fe1a3e6df6db7a",
	name: "fetchProjects",
	filename: "src/utils/projects.ts"
}, (opts) => fetchProjects.__executeServer(opts));
var fetchProjects = createServerFn({ method: "GET" }).handler(fetchProjects_createServerFn_handler, () => prisma.project.findMany({
	orderBy: { id: "asc" },
	select: {
		id: true,
		displayId: true,
		name: true
	}
}));
//#endregion
export { fetchProjects_createServerFn_handler };
