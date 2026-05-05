import { i as createServerFn } from "../server.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
/* empty css             */
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
//#region src/routes/index.tsx
var $$splitComponentImporter = () => import("./routes-32UMeRUr.js");
var Route = createFileRoute("/")({
	component: lazyRouteComponent($$splitComponentImporter, "component"),
	loader: () => getChangelogs()
});
var getChangelogs = createServerFn({ method: "GET" }).handler(createSsrRpc("855d84ae08da5d34a6b92ee381162a6c87b1b5d11addd4470c8e8c13f4d10aa5"));
//#endregion
export { Route as t };
