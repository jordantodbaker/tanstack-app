import { i as createServerFn } from "../server.js";
import { o as useSelectedProject, r as fetchSetupCbsItems } from "./setup-DOEkvnEs.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
import { t as cn } from "./utils-Bn6jYw4Z.js";
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { queryOptions, useQuery } from "@tanstack/react-query";
//#region src/utils/projects.ts
var fetchProjects = createServerFn({ method: "GET" }).handler(createSsrRpc("ffc8c2852feac952298200193c68aabf5a14e581c7b233e828fe1a3e6df6db7a"));
var projectsQueryOptions = () => queryOptions({
	queryKey: ["projects"],
	queryFn: () => fetchProjects()
});
//#endregion
//#region src/components/ProjectSelect.tsx
function ProjectSelect({ id, className, placeholder = "Select a project…" }) {
	const { data: projects = [] } = useQuery(projectsQueryOptions());
	const { projectId, setProjectId } = useSelectedProject();
	return /* @__PURE__ */ jsxs("select", {
		id,
		value: projectId ?? "",
		onChange: (e) => {
			const v = e.target.value;
			setProjectId(v ? Number(v) : null);
		},
		className: cn("h-8 rounded-md border border-input bg-white px-2 text-sm", className),
		children: [/* @__PURE__ */ jsx("option", {
			value: "",
			children: placeholder
		}), projects.map((p) => /* @__PURE__ */ jsxs("option", {
			value: p.id,
			children: [
				p.displayId,
				" — ",
				p.name
			]
		}, p.id))]
	});
}
//#endregion
//#region src/routes/setup.tsx
var $$splitComponentImporter = () => import("./setup-CoFgEftW.js");
var Route = createFileRoute("/setup")({
	loader: () => fetchSetupCbsItems(),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { ProjectSelect as n, Route as t };
