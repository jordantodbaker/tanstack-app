import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import { VersionId } from "~/lib/validators";
import { hasAtLeastRole, type CurrentUser } from "./users";
import { requireVersionAccess } from "./users.server";
import { recordUpdates } from "./audit.server";
import { resolveRoleRates, toPlainRates } from "~/lib/role-rates";
import {
  planRateRefresh,
  type RateRefreshPlan,
  type RefreshableRow,
} from "~/lib/rate-refresh";

/**
 * Re-stamping stored labor rates on an estimate revision.
 *
 * `FefRow.laborRate` is written when someone picks a Role + Schedule or a Crew
 * Mix, and never re-read from the rate book afterwards. Correcting a rate
 * therefore leaves existing line items on the old number. This pair of server
 * fns lets someone see exactly which rows drifted and update them on purpose.
 *
 * Scoped to a whole revision rather than one sheet: a rate correction almost
 * never applies to a single discipline.
 *
 * Rates are resolved through the version → project → global chain, so a frozen
 * revision resolves to its own frozen book and a refresh finds nothing to do.
 * Freezing and refreshing don't fight.
 */

const RefreshInput = z.object({ versionId: VersionId });

/** Writing over an estimate's line items is an approver-level act. */
function assertMayRefresh(actor: CurrentUser): void {
  if (!hasAtLeastRole(actor.role, "APPROVER")) {
    throw new Error("Forbidden: refreshing rates requires APPROVER privilege");
  }
}

/** Everything the planner needs, read at one scope. */
async function loadRefreshInputs(versionId: number, projectId: number) {
  const [rows, globalRates, projectRates, versionRates, crewMixes] =
    await Promise.all([
      prisma.fefRow.findMany({
        where: { versionId },
        select: {
          id: true,
          role: true,
          schedule: true,
          crewMixId: true,
          laborRate: true,
          laborHours: true,
        },
      }),
      prisma.roleRate.findMany({
        include: { role: { select: { name: true } } },
      }),
      prisma.projectRoleRate.findMany({
        where: { projectId },
        include: { role: { select: { name: true } } },
      }),
      prisma.versionRoleRate.findMany({
        where: { versionId },
        include: { role: { select: { name: true } } },
      }),
      prisma.crewMix.findMany({
        select: {
          id: true,
          name: true,
          schedule: true,
          members: {
            select: { count: true, role: { select: { name: true } } },
          },
        },
      }),
    ]);

  const flatten = (
    rs: { schedule: string; rate: number; role: { name: string } }[],
  ) => rs.map((r) => ({ roleName: r.role.name, schedule: r.schedule, rate: r.rate }));

  return {
    rows: rows as RefreshableRow[],
    rates: toPlainRates(
      resolveRoleRates({
        global: flatten(globalRates),
        project: flatten(projectRates),
        version: flatten(versionRates),
      }),
    ),
    crewMixes: crewMixes.map((m) => ({
      id: m.id,
      name: m.name,
      schedule: m.schedule,
      members: m.members.map((mm) => ({
        roleName: mm.role.name,
        count: mm.count,
      })),
    })),
  };
}

/** What a refresh WOULD change. Reads only. */
export const previewVersionRateRefresh = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => RefreshInput.parse(input))
  .handler(async ({ data }): Promise<RateRefreshPlan> => {
    const { projectId } = await requireVersionAccess(data.versionId);
    return planRateRefresh(
      await loadRefreshInputs(data.versionId, projectId),
    );
  });

export type RateRefreshResult = { rowsUpdated: number };

/**
 * Apply the refresh.
 *
 * Re-plans server-side rather than trusting a plan posted by the client: the
 * preview the user approved may be minutes old, and the rows it names could
 * have moved since. Everything runs in one transaction, so a sheet is never
 * half re-rated.
 *
 * Each distinct (source, old → new) group gets one audit row per affected line
 * item, batched into a single insert.
 */
export const applyVersionRateRefresh = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RefreshInput.parse(input))
  .handler(async ({ data }): Promise<RateRefreshResult> => {
    const { projectId, actor } = await requireVersionAccess(data.versionId);
    assertMayRefresh(actor);

    return prisma.$transaction(async (tx) => {
      const inputs = await loadRefreshInputs(data.versionId, projectId);
      const plan = planRateRefresh(inputs);
      if (plan.rowCount === 0) return { rowsUpdated: 0 };

      for (const change of plan.changes) {
        await tx.fefRow.updateMany({
          where: { id: { in: change.rowIds } },
          data: { laborRate: change.newRate },
        });
      }

      await recordUpdates(
        tx,
        plan.changes.flatMap((change) =>
          change.rowIds.map((id) => ({
            target: {
              entityType: "FefRow",
              entityId: id,
              projectId,
              actor,
            },
            changes: [
              {
                field: "laborRate",
                oldValue: change.storedRate === "" ? null : change.storedRate,
                newValue: change.newRate,
              },
            ],
          })),
        ),
        `Labor-rate refresh on version ${data.versionId}.`,
      );

      return { rowsUpdated: plan.rowCount };
    });
  });

export const versionRateRefreshQueryOptions = (versionId: number | null) =>
  queryOptions({
    queryKey: qk.rateRefreshPreview(versionId),
    queryFn: (): Promise<RateRefreshPlan> =>
      versionId === null
        ? Promise.resolve({ changes: [], rowCount: 0, totalDelta: 0 })
        : previewVersionRateRefresh({ data: { versionId } }),
    enabled: versionId !== null,
    // The preview is only meaningful against current data — never serve a
    // stale one, or someone approves a plan that no longer describes the sheet.
    staleTime: 0,
    gcTime: 0,
  });

/** Cache-bust after a refresh: every sheet's rows changed. */
export function invalidateRateRefreshQueries(
  queryClient: QueryClient,
  versionId: number | null,
): void {
  queryClient.invalidateQueries({ queryKey: qk.fefRows.all() });
  queryClient.invalidateQueries({ queryKey: qk.projectFefRowTotalsAll() });
  queryClient.invalidateQueries({ queryKey: qk.invalidByDisciplineAll() });
  queryClient.invalidateQueries({
    queryKey: qk.rateRefreshPreview(versionId),
  });
}
