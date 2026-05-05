import { i as createServerFn } from "../server.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
import { queryOptions } from "@tanstack/react-query";
createServerFn({ method: "GET" }).handler(createSsrRpc("96f671ef132c4c9bc06fdbbb37eada8785fc163c56be4f43dca7b822d52a70ea"));
var fetchCbsItemsByL1 = createServerFn({ method: "GET" }).inputValidator((l1Values) => l1Values).handler(createSsrRpc("d58d2cd0b99d419847ac51263af81fe9a7e64580c99178a4b4c2d6d7316d4664"));
createServerFn({ method: "GET" }).inputValidator((input) => input).handler(createSsrRpc("32446a2c9e7f55b7da15d8ad4704f2d196c9841c1188a7c0e1362d153ea0e5e3"));
var fetchCbsItemsByL1Filtered = createServerFn({ method: "GET" }).inputValidator((input) => input).handler(createSsrRpc("e0b17fee7856b550a9119b9640848e3dad4c008f12a020f65b037ef56a380f1b"));
var cbsItemsByL1FilteredQueryOptions = (input) => queryOptions({
	queryKey: [
		"cbsItemsByL1Filtered",
		input.l1Values,
		input.projectId
	],
	queryFn: () => fetchCbsItemsByL1Filtered({ data: input })
});
var fetchCbsItemsByL1EndsWith = createServerFn({ method: "GET" }).inputValidator((suffixes) => suffixes).handler(createSsrRpc("b744cacc202acc9915654ec1b006a3bd6678f21ef6a5ee1675011d370d9f3410"));
//#endregion
export { fetchCbsItemsByL1 as n, fetchCbsItemsByL1EndsWith as r, cbsItemsByL1FilteredQueryOptions as t };
