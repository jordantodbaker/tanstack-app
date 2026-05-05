import { i as createServerFn } from "../server.js";
import { t as createSsrRpc } from "./createSsrRpc-BHnkakhN.js";
import { queryOptions } from "@tanstack/react-query";
//#region src/utils/roles.ts
var fetchRoleOptions = createServerFn({ method: "GET" }).handler(createSsrRpc("2d6ccb73ed96e86de31e6cf77ed5315537d50e89c50ad47dd53bba86207ea242"));
var fetchScheduleOptions = createServerFn({ method: "GET" }).handler(createSsrRpc("0295d564bff697b1dd9cd4f6417e21e0d2a39fbff2a4ab33fda1a4be3c474407"));
var fetchRoleRates = createServerFn({ method: "GET" }).handler(createSsrRpc("f161fa5ba2647482742985e4af52e5564f511834bb3ff9b004fac84bedaf67c0"));
var roleOptionsQueryOptions = () => queryOptions({
	queryKey: ["roleOptions"],
	queryFn: () => fetchRoleOptions()
});
var scheduleOptionsQueryOptions = () => queryOptions({
	queryKey: ["scheduleOptions"],
	queryFn: () => fetchScheduleOptions()
});
var roleRatesQueryOptions = () => queryOptions({
	queryKey: ["roleRates"],
	queryFn: () => fetchRoleRates()
});
//#endregion
export { roleRatesQueryOptions as a, roleOptionsQueryOptions as i, fetchRoleRates as n, scheduleOptionsQueryOptions as o, fetchScheduleOptions as r, fetchRoleOptions as t };
