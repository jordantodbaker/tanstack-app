import { r as disciplines } from "./disciplines-D-_GrFF6.js";
import { n as allowedFefCbsItemIdsQueryOptions, o as useSelectedProject } from "./setup-DOEkvnEs.js";
import { a as roleRatesQueryOptions, i as roleOptionsQueryOptions, o as scheduleOptionsQueryOptions } from "./roles-CFyi1BKl.js";
import { t as Route } from "./_discipline-DD_LBdvt.js";
import { i as toCbsOption } from "./fef-helpers-DzaK2f1D.js";
import { t as DisciplinePage } from "./FefTable-D0mc4DKi.js";
import * as React$1 from "react";
import { jsx } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
//#region src/components/DisciplineRoute.tsx
function DisciplineRoute({ title, cbsItems }) {
	const discipline = disciplines.find((d) => d.label === title);
	const icon = discipline?.icon;
	const { data: roleOptions } = useQuery(roleOptionsQueryOptions());
	const { data: scheduleOptions } = useQuery(scheduleOptionsQueryOptions());
	const { data: roleRates } = useQuery(roleRatesQueryOptions());
	const { projectId } = useSelectedProject();
	const { data: allowedIds } = useQuery({
		...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
		enabled: projectId !== null
	});
	const allowedIdSet = React$1.useMemo(() => new Set(allowedIds ?? []), [allowedIds]);
	const isMaterialCode = (item) => item.l1.endsWith("01") || item.l1.endsWith("31");
	const cbsOptions = cbsItems.filter((item) => !isMaterialCode(item) && (projectId === null || allowedIdSet.has(item.id))).map(toCbsOption);
	const laborKey = discipline?.l1Codes?.[0]?.[0];
	return /* @__PURE__ */ jsx(DisciplinePage, {
		title,
		icon,
		cbsOptions,
		laborKey,
		roleOptions,
		scheduleOptions,
		roleRates
	});
}
//#endregion
//#region src/routes/$discipline.tsx?tsr-split=component
function DynamicDiscipline() {
	const { title, cbsItems } = Route.useLoaderData();
	return /* @__PURE__ */ jsx(DisciplineRoute, {
		title,
		cbsItems
	});
}
//#endregion
export { DynamicDiscipline as component };
