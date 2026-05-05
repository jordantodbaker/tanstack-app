import { r as fetchCbsItemsByL1EndsWith } from "./cbs-hpiQf0Mk.js";
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
//#region src/routes/materials.tsx
var $$splitComponentImporter = () => import("./materials-CrBVAika.js");
var Route = createFileRoute("/materials")({
	loader: () => fetchCbsItemsByL1EndsWith({ data: ["01", "31"] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
