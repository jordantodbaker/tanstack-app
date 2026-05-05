import { i as createServerFn } from "../server.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
import * as React$1 from "react";
import { jsx } from "react/jsx-runtime";
import { queryOptions } from "@tanstack/react-query";
//#region src/lib/selected-project.tsx
var STORAGE_KEY = "selectedProjectId";
var SelectedProjectContext = React$1.createContext(null);
function readPersisted() {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}
function SelectedProjectProvider({ children }) {
	const [projectId, setProjectIdState] = React$1.useState(null);
	React$1.useEffect(() => {
		setProjectIdState(readPersisted());
	}, []);
	const setProjectId = React$1.useCallback((id) => {
		setProjectIdState(id);
		if (typeof window !== "undefined") if (id === null) window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, String(id));
	}, []);
	const value = React$1.useMemo(() => ({
		projectId,
		setProjectId
	}), [projectId, setProjectId]);
	return /* @__PURE__ */ jsx(SelectedProjectContext.Provider, {
		value,
		children
	});
}
function useSelectedProject() {
	const ctx = React$1.useContext(SelectedProjectContext);
	if (!ctx) throw new Error("useSelectedProject must be used within SelectedProjectProvider");
	return ctx;
}
//#endregion
//#region src/utils/setup.ts
var fetchSetupCbsItems = createServerFn({ method: "GET" }).handler(createSsrRpc("ac70d93935982bff82e1584802125b27955cadf6222b0dffb4eae3e53dd44311"));
var fetchAllowedFefCbsItemIds = createServerFn({ method: "GET" }).inputValidator((projectId) => projectId).handler(createSsrRpc("e0daf57febeed21409b1a91876e353d1970a1426d81604b19bb7edc23de84811"));
var allowedFefCbsItemIdsQueryOptions = (projectId) => queryOptions({
	queryKey: ["allowedFefCbsItemIds", projectId],
	queryFn: () => fetchAllowedFefCbsItemIds({ data: projectId })
});
var fetchAllowedCbsL1Codes = createServerFn({ method: "GET" }).inputValidator((projectId) => projectId).handler(createSsrRpc("bd3fbad6a6d35af36efaee5d39e6060b21a7552ac51838b7689529a68cd0d938"));
var allowedCbsL1CodesQueryOptions = (projectId) => queryOptions({
	queryKey: ["allowedCbsL1Codes", projectId],
	queryFn: () => fetchAllowedCbsL1Codes({ data: projectId })
});
var updateAllowedFefCbsItems = createServerFn({ method: "POST" }).inputValidator((input) => input).handler(createSsrRpc("b273dc4d40f588922f9e36b42588cba9f18492cdff9a9016b22ebb9823b44aef"));
//#endregion
export { SelectedProjectProvider as a, updateAllowedFefCbsItems as i, allowedFefCbsItemIdsQueryOptions as n, useSelectedProject as o, fetchSetupCbsItems as r, allowedCbsL1CodesQueryOptions as t };
