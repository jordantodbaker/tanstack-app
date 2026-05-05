import { n as disciplineById } from "./disciplines-D-_GrFF6.js";
import { n as fetchCbsItemsByL1 } from "./cbs-hpiQf0Mk.js";
import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
//#region src/routes/$discipline.tsx
var $$splitComponentImporter = () => import("./_discipline-BwVf1fwz.js");
var Route = createFileRoute("/$discipline")({
	loader: async ({ params }) => {
		const config = disciplineById[params.discipline];
		if (!config?.l1Codes) throw notFound();
		const cbsItems = await fetchCbsItemsByL1({ data: config.l1Codes });
		return {
			title: config.label,
			cbsItems
		};
	},
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
