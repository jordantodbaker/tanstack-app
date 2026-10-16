import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { prisma } from "../server/db";
import {
  adminHandler,
  adminHandlerNoInput,
  projectIdScopedHandler,
} from "./users.server";
import { buildCodeUsage, type UsageModel } from "~/lib/cbs-usage";
import type { HealthReport } from "~/lib/cbs-health";
import { getCbsHealthReport } from "./cbs-health.server";
import {
  buildHealthCheckWorkbook,
  healthCheckFilename,
} from "./cbs-health-xlsx.server";
import { qk } from "~/lib/query-keys";

/**
 * The two read-only CBS analyses: code usage per project, and catalog health.
 *
 * Both are aggregates — a few hundred rows out of a ~12,000-row catalog — so
 * they are computed here and shipped as answers rather than as evidence.
 */

function parseProjectId(input: unknown): number {
  const id = Number(input);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid project id");
  return id;
}

/**
 * Which of a project's granted codes its estimate actually books against.
 *
 * Project-scoped rather than admin-only: this is the project's own data, and
 * the people who would prune an allow-list are the ones estimating with it.
 */
export const fetchProjectCodeUsage = createServerFn({ method: "GET" })
  .inputValidator(parseProjectId)
  .handler(
    projectIdScopedHandler(async ({ data: projectId }): Promise<UsageModel> => {
      const granted = await prisma.cbsItem.findMany({
        where: { allowedInProjects: { some: { id: projectId } } },
        select: { displayCode: true, name: true },
        orderBy: { id: "asc" },
      });
      // Every version, not just the current one: a code dropped from the
      // latest version is still why an earlier one reads as it does, so
      // revoking it on that basis would be wrong.
      const used = await prisma.fefRow.groupBy({
        by: ["cbsCode"],
        where: { projectId, NOT: { cbsCode: "" } },
        _count: { _all: true },
      });
      // Which of the used codes are CBS rows at all. The take-off pages build
      // codes from an account plus the row's metallurgy, bore size and
      // fabricate/erect, so most estimate codes were never dictionary rows;
      // without this the page would report them as missing grants.
      const known = await prisma.cbsItem.findMany({
        where: { displayCode: { in: used.map((u) => u.cbsCode) } },
        select: { displayCode: true },
      });
      return buildCodeUsage(
        granted,
        new Map(used.map((u) => [u.cbsCode, u._count._all])),
        new Set(known.map((k) => k.displayCode)),
      );
    }),
  );

export const projectCodeUsageQueryOptions = (projectId: number) =>
  queryOptions({
    queryKey: qk.cbs.codeUsage(projectId),
    queryFn: () => fetchProjectCodeUsage({ data: projectId }),
    // Moves whenever the estimate is edited, so keep it short.
    staleTime: 30 * 1000,
  });

/**
 * Catalog health. Admin-guarded: it reads the whole dictionary and the
 * workbook on disk, and names the projects holding each affected code.
 */
export const fetchCbsHealth = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput((): Promise<HealthReport> => getCbsHealthReport()),
);

/**
 * One check's findings as an .xlsx worklist.
 *
 * Re-reads the cached report rather than taking the rows from the client: the
 * file then says the same thing the page does, and a stale tab cannot export
 * findings that have since been fixed.
 */
export const exportCbsHealthCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown })?.id;
    if (typeof id !== "string" || id === "")
      throw new Error("Missing check id");
    return { id };
  })
  .handler(
    adminHandler(async ({ data }) => {
      const report = await getCbsHealthReport();
      const check = report.checks.find((c) => c.id === data.id);
      if (!check) throw new Error(`Unknown health check: ${data.id}`);
      const buffer = await buildHealthCheckWorkbook(check, report.generatedAt);
      return {
        filename: healthCheckFilename(check, report.generatedAt),
        base64: buffer.toString("base64"),
        rowCount: check.findings.length,
      };
    }),
  );

export const cbsHealthQueryOptions = () =>
  queryOptions({
    queryKey: qk.cbs.health(),
    queryFn: () => fetchCbsHealth(),
    // Reads a 1.3 MB workbook off disk; don't repeat it on every mount.
    staleTime: 5 * 60 * 1000,
  });
