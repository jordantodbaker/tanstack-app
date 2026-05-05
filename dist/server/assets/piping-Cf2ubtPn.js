import { i as createServerFn } from "../server.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
import { n as fetchCbsItemsByL1 } from "./cbs-hpiQf0Mk.js";
import { n as fetchRoleRates, r as fetchScheduleOptions, t as fetchRoleOptions } from "./roles-CFyi1BKl.js";
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
//#region src/utils/piping.ts
var fetchPipingGroups = createServerFn({ method: "GET" }).handler(createSsrRpc("4b879ed8647ff3b579e4d1a65d94310a9c73f57d9bc16223870f57475d11d11a"));
var fetchPipingFactorCodes = createServerFn({ method: "GET" }).handler(createSsrRpc("8ccc46a1c795069432f95cd945b6b9102a3c033e8081b448af7e25596c6ba993"));
var fetchPipingFactors = createServerFn({ method: "GET" }).handler(createSsrRpc("1fc43d4c16672dab701445d89a89594921067cd8a0514da62d904ef89ba04492"));
//#endregion
//#region src/routes/piping.tsx
var $$splitComponentImporter = () => import("./piping-DOSAoM94.js");
var Route = createFileRoute("/piping")({
	loader: () => Promise.all([
		fetchPipingGroups(),
		fetchCbsItemsByL1({ data: ["602", "632"] }),
		fetchRoleOptions(),
		fetchScheduleOptions(),
		fetchRoleRates(),
		fetchPipingFactorCodes(),
		fetchPipingFactors()
	]).then(([pipingGroups, supportLaborItems, roleOptions, scheduleOptions, roleRates, taskCodeOptions, pipingFactors]) => ({
		pipingGroups,
		supportLaborItems,
		roleOptions,
		scheduleOptions,
		roleRates,
		taskCodeOptions,
		pipingFactors
	})),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
