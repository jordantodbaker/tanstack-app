import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import {
  parseIdInput,
  parseIdScalar,
  parseProjectIdInput,
  parsePromoteTrendInput,
  parseTransitionInput,
  parseUpsertTrend,
} from "~/lib/validators";
import {
  assertProjectAccess,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import { hasAtLeastRole } from "./users";
import {
  diffFields,
  recordCreate,
  recordDelete,
  recordUpdate,
} from "./audit.server";
import { applyWorkflowTransition } from "./workflow.server";
import { TREND_TRANSITIONS } from "./workflow";
import { TREND_STATUS_LABELS } from "./trendLabels";

/**
 * SERVER-SIDE Trend module. Trends are anticipated cost impacts that haven't
 * been authorized as a CVR yet — together they drive the project's AFC
 * (Anticipated Final Cost). Lifecycle: IDENTIFIED → PROBABLE → CONVERTED
 * (a CVR was raised) | REJECTED | VOID. CONVERTED is reached via the
 * `promoteTrendToCvr` server fn, which both creates the CVR and stamps the
 * trend in the same transaction so the link is always consistent.
 */

export const TREND_STATUSES = [
  "IDENTIFIED",
  "PROBABLE",
  "CONVERTED",
  "REJECTED",
  "VOID",
] as const;
export type TrendStatus = (typeof TREND_STATUSES)[number];

export const TREND_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TrendPriority = (typeof TREND_PRIORITIES)[number];

/** Trends still affecting the forecast — drive AFC math and stats cards. */
export const TREND_ACTIVE_STATUSES: TrendStatus[] = ["IDENTIFIED", "PROBABLE"];

/**
 * Slim shape used by the list-page table and the dashboard rollups. Drops
 * the three long-text fields (`description`, `reasonNarrative`, `notes`)
 * that only the edit dialog and the CSV export need. The dialog refetches
 * the full record on open via `trendQueryOptions(id)`.
 */
export type TrendListItem = {
  id: number;
  projectId: number;
  trendNumber: string;
  title: string;
  status: TrendStatus;
  priority: TrendPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  probability: number;
  costLow: number;
  costLikely: number;
  costHigh: number;
  scheduleDaysImpact: number;
  identifiedAt: string;
  neededBy: string | null;
  closedAt: string | null;
  linkedRfiId: number | null;
  linkedFcoId: number | null;
  linkedCvrId: number | null;
  initiatedBy: string;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TrendItem = TrendListItem & {
  description: string;
  reasonNarrative: string;
  notes: string;
};

type TrendScalarRow = Awaited<ReturnType<typeof prisma.trend.findMany>>[number];

const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

const toItem = (r: TrendScalarRow): TrendItem => ({
  ...r,
  status: r.status as TrendStatus,
  priority: r.priority as TrendPriority,
  identifiedAt: r.identifiedAt.toISOString(),
  neededBy: serializeDate(r.neededBy),
  closedAt: serializeDate(r.closedAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * Prisma `select` for the slim list shape — keep in sync with `TrendListItem`.
 */
const LIST_SELECT = {
  id: true,
  projectId: true,
  trendNumber: true,
  title: true,
  status: true,
  priority: true,
  discipline: true,
  cbsCodes: true,
  locationArea: true,
  probability: true,
  costLow: true,
  costLikely: true,
  costHigh: true,
  scheduleDaysImpact: true,
  identifiedAt: true,
  neededBy: true,
  closedAt: true,
  linkedRfiId: true,
  linkedFcoId: true,
  linkedCvrId: true,
  initiatedBy: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type TrendListRow = Awaited<
  ReturnType<typeof prisma.trend.findMany<{ select: typeof LIST_SELECT }>>
>[number];

const toListItem = (r: TrendListRow): TrendListItem => ({
  ...r,
  status: r.status as TrendStatus,
  priority: r.priority as TrendPriority,
  identifiedAt: r.identifiedAt.toISOString(),
  neededBy: serializeDate(r.neededBy),
  closedAt: serializeDate(r.closedAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const fetchTrendList = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<TrendListItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.trend.findMany({
      where: { projectId },
      select: LIST_SELECT,
      orderBy: [{ identifiedAt: "desc" }],
    });
    return rows.map(toListItem);
  });

export const trendListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.trends.list(projectId),
    queryFn: (): Promise<TrendListItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchTrendList({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

/**
 * Full list — every column. Triggered by the CSV export button on click.
 */
export const fetchTrendListFull = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<TrendItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.trend.findMany({
      where: { projectId },
      orderBy: [{ identifiedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const trendListFullQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.trends.full(projectId),
    queryFn: (): Promise<TrendItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchTrendListFull({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

export const fetchTrend = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data: id }): Promise<TrendItem> => {
    const row = await prisma.trend.findUniqueOrThrow({ where: { id } });
    await requireProjectAccess(row.projectId);
    return toItem(row);
  });

export const trendQueryOptions = (id: number | null) =>
  queryOptions({
    queryKey: qk.trends.single(id),
    queryFn: (): Promise<TrendItem | null> =>
      id === null ? Promise.resolve(null) : fetchTrend({ data: id }),
    enabled: id !== null,
  });

export type UpsertTrendInput = {
  id?: number;
  projectId: number;
  trendNumber: string;
  title: string;
  description: string;
  priority: TrendPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  probability: number;
  costLow: number;
  costLikely: number;
  costHigh: number;
  scheduleDaysImpact: number;
  reasonNarrative: string;
  notes: string;
  identifiedAt: string;
  neededBy: string | null;
  linkedRfiId: number | null;
  linkedFcoId: number | null;
  initiatedBy: string;
};

const TREND_AUDIT_FIELDS = [
  "trendNumber",
  "title",
  "description",
  "status",
  "priority",
  "discipline",
  "cbsCodes",
  "locationArea",
  "probability",
  "costLow",
  "costLikely",
  "costHigh",
  "scheduleDaysImpact",
  "reasonNarrative",
  "notes",
  "identifiedAt",
  "neededBy",
  "closedAt",
  "linkedRfiId",
  "linkedFcoId",
  "linkedCvrId",
  "initiatedBy",
] as const satisfies readonly (keyof TrendScalarRow)[];

function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

export const upsertTrend = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertTrend)
  .handler(async ({ data }): Promise<TrendItem> => {
    const actor = await requireProjectAccess(data.projectId);
    // Cross-project trend links would let one project's trend point at
    // another project's RFI/FCO. Validate that any link belongs to the
    // claimed project before writing the row.
    if (data.linkedRfiId !== null) {
      const rfi = await prisma.rfi.findUnique({
        where: { id: data.linkedRfiId },
        select: { projectId: true },
      });
      if (!rfi || rfi.projectId !== data.projectId) {
        throw new Error("Linked RFI does not belong to this project.");
      }
    }
    if (data.linkedFcoId !== null) {
      const fco = await prisma.fieldChangeOrder.findUnique({
        where: { id: data.linkedFcoId },
        select: { projectId: true },
      });
      if (!fco || fco.projectId !== data.projectId) {
        throw new Error("Linked FCO does not belong to this project.");
      }
    }
    // `status` and `linkedCvrId` are intentionally omitted from the payload:
    // status moves through `transitionTrend`, and `linkedCvrId` is only set
    // by `promoteTrendToCvr` so the link and the CONVERTED state arrive
    // atomically.
    const payload = {
      projectId: data.projectId,
      trendNumber: data.trendNumber,
      title: data.title,
      description: data.description,
      priority: data.priority,
      discipline: data.discipline,
      cbsCodes: data.cbsCodes,
      locationArea: data.locationArea,
      probability: clampProbability(data.probability),
      costLow: data.costLow,
      costLikely: data.costLikely,
      costHigh: data.costHigh,
      scheduleDaysImpact: data.scheduleDaysImpact,
      reasonNarrative: data.reasonNarrative,
      notes: data.notes,
      identifiedAt: new Date(data.identifiedAt),
      neededBy: data.neededBy ? new Date(data.neededBy) : null,
      linkedRfiId: data.linkedRfiId,
      linkedFcoId: data.linkedFcoId,
      initiatedBy: data.initiatedBy,
    };
    const row = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const before = await tx.trend.findUniqueOrThrow({
          where: { id: data.id },
        });
        const updated = await tx.trend.update({
          where: { id: data.id },
          data: payload,
        });
        await recordUpdate(
          tx,
          {
            entityType: "Trend",
            entityId: updated.id,
            projectId: updated.projectId,
            actor,
          },
          diffFields(before, updated, TREND_AUDIT_FIELDS),
        );
        return updated;
      }
      const created = await tx.trend.create({
        data: { ...payload, createdById: actor.id },
      });
      await recordCreate(tx, {
        entityType: "Trend",
        entityId: created.id,
        projectId: created.projectId,
        actor,
      });
      return created;
    });
    return toItem(row);
  });

// PROBABLE moves the trend's exposure from "loose hunch" into the published
// AFC; it warrants the reviewer fan-out. REJECTED/CONVERTED are outcomes
// that the originator should see; they don't fan out to the reviewer pool.
const TREND_STATUSES_NEEDING_REVIEW: ReadonlySet<string> = new Set(["PROBABLE"]);

export const transitionTrend = createServerFn({ method: "POST" })
  .inputValidator(parseTransitionInput)
  .handler(async ({ data }): Promise<TrendItem> => {
    const pre = await prisma.trend.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(pre.projectId);
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.trend.findUniqueOrThrow({
        where: { id: data.id },
      });
      const updated = await applyWorkflowTransition({
        tx,
        before,
        actor,
        action: data.action,
        comment: data.comment,
        config: {
          entityType: "Trend",
          transitionMap: TREND_TRANSITIONS,
          statusLabels: TREND_STATUS_LABELS,
          statusesNeedingReview: TREND_STATUSES_NEEDING_REVIEW,
          auditFields: ["status", "closedAt"],
          buildTitle: (r) =>
            `${r.trendNumber || `Trend #${r.id}`} — ${r.title}`,
          // Stamp closedAt when landing in a terminal state so list views
          // can show "closed on" without a separate UPDATE round-trip.
          extraUpdateData: (transition) =>
            transition.to === "REJECTED" || transition.to === "VOID"
              ? { closedAt: new Date() }
              : transition.to === "IDENTIFIED"
                ? { closedAt: null }
                : {},
        },
        updateRow: (data) =>
          tx.trend.update({ where: { id: before.id }, data }),
      });
      return updated;
    });
    return toItem(row);
  });

/**
 * Promote a trend to a CVR. Creates a new ChangeLog row pre-populated from
 * the trend (title, description, cbsCodes, discipline, area, scheduleDays,
 * `costImpact = costLikely`), stamps the trend with `linkedCvrId` and moves
 * its status to CONVERTED — all in one transaction so the link is never
 * orphaned. Returns the new CVR id so the caller can navigate.
 *
 * Gated to APPROVER+ since promotion adds an authorized-budget revision
 * obligation; matches the role gate on `transitionTrend`'s PROBABLE step.
 */
export const promoteTrendToCvr = createServerFn({ method: "POST" })
  .inputValidator(parsePromoteTrendInput)
  .handler(async ({ data }): Promise<{ cvrId: number }> => {
    const trend = await prisma.trend.findUniqueOrThrow({
      where: { id: data.trendId },
    });
    const actor = await requireProjectAccess(trend.projectId);
    if (!hasAtLeastRole(actor.role, "APPROVER")) {
      throw new Error("Approver role or higher required to promote a trend.");
    }
    if (trend.status === "CONVERTED") {
      throw new Error("This trend has already been promoted to a CVR.");
    }
    if (trend.status === "VOID" || trend.status === "REJECTED") {
      throw new Error(`Cannot promote a ${trend.status.toLowerCase()} trend.`);
    }
    const isOriginator =
      trend.createdById !== null && trend.createdById === actor.id;
    // Block self-conversion for the same reason `blockOriginator` exists on
    // the workflow approval steps: a trend converting to a CVR shifts real
    // budget; the originator shouldn't sign their own.
    if (isOriginator) {
      throw new Error(
        "The trend originator cannot promote it themselves — ask another approver.",
      );
    }

    return prisma.$transaction(async (tx) => {
      const cvr = await tx.changeLog.create({
        data: {
          projectId: trend.projectId,
          // Number assigned by the user later; not auto-generated to match
          // the existing CVR numbering convention.
          cvrNumber: "",
          title: trend.title,
          description: trend.description,
          // CVR opens for the team to refine before submitting for approval;
          // schema default (REQUESTED) is the right starting state.
          type: "SCOPE",
          discipline: trend.discipline,
          cbsCodes: trend.cbsCodes,
          originator: actor.email,
          costImpact: trend.costLikely,
          scheduleDaysImpact: trend.scheduleDaysImpact,
          laborHoursImpact: 0,
          riskLevel: "MEDIUM",
          reasonCode: "",
          requestedAt: new Date(),
          dueDate: trend.neededBy,
          notes: `Promoted from Trend ${trend.trendNumber || `#${trend.id}`}`,
          area: trend.locationArea,
          createdById: actor.id,
        },
      });
      await recordCreate(tx, {
        entityType: "ChangeLog",
        entityId: cvr.id,
        projectId: cvr.projectId,
        actor,
      });
      const updatedTrend = await tx.trend.update({
        where: { id: trend.id },
        data: {
          status: "CONVERTED",
          linkedCvrId: cvr.id,
          closedAt: new Date(),
        },
      });
      // Audit the trend's status flip on the Trend's own timeline so a
      // reviewer browsing the trend sees the conversion without opening the
      // CVR; mirrors `promoteRfiToFco`.
      await recordUpdate(
        tx,
        {
          entityType: "Trend",
          entityId: updatedTrend.id,
          projectId: updatedTrend.projectId,
          actor,
        },
        diffFields(trend, updatedTrend, [
          "status",
          "linkedCvrId",
          "closedAt",
        ] as const),
      );
      return { cvrId: cvr.id };
    });
  });

export const deleteTrend = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const row = await prisma.trend.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    await assertProjectAccess(actor, row.projectId);
    await prisma.$transaction(async (tx) => {
      await tx.trend.delete({ where: { id: data.id } });
      await recordDelete(tx, {
        entityType: "Trend",
        entityId: data.id,
        projectId: row.projectId,
        actor,
      });
    });
    return { ok: true };
  });

/**
 * The AFC contribution from a single trend. Pure so reporting + dashboard
 * can both call it without duplicating the rule. Only IDENTIFIED + PROBABLE
 * trends contribute; CONVERTED ones are already in `currentBudget` via the
 * linked CVR, and REJECTED/VOID drop out of the forecast entirely.
 *
 * Lives in this client-safe module so the dialog can render a live preview
 * without pulling in any server-only code. The DB-fed bucketed roll-up
 * (`loadTrendForecastByBucket`) lives in `reporting.ts` because mixing
 * prisma calls into a module imported by the client breaks tree-shaking —
 * every other prisma access in this file is wrapped in `createServerFn`
 * so the client bundle stays clean.
 */
export function trendForecastContribution(trend: {
  status: TrendStatus;
  probability: number;
  costLikely: number;
}): number {
  if (!TREND_ACTIVE_STATUSES.includes(trend.status)) return 0;
  const p = clampProbability(trend.probability);
  const cost = Number.isFinite(trend.costLikely) ? trend.costLikely : 0;
  return p * cost;
}

/**
 * Cache-bust set fired after every Trend mutation. Trends drive AFC, so the
 * EVM reporting caches also have to drop — they fold trend forecast
 * contribution into their roll-ups. `promoteTrendToCvr` mints a CVR;
 * for that case callers pair this with `invalidateChangeLogQueries`.
 */
export function invalidateTrendQueries(
  queryClient: QueryClient,
  projectId: number | null,
): void {
  queryClient.invalidateQueries({ queryKey: qk.trends.list(projectId) });
  queryClient.invalidateQueries({ queryKey: qk.trends.full(projectId) });
  // EVM caches fold trend forecast contribution into their roll-ups, so they
  // must drop on every trend mutation. `periodWithEvm` is a prefix-match bust
  // because we don't know which periodIds are cached for this project.
  queryClient.invalidateQueries({
    queryKey: qk.reporting.periodWithEvmAll(),
  });
  queryClient.invalidateQueries({
    queryKey: qk.reporting.latestPeriodWithEvm(projectId),
  });
  queryClient.invalidateQueries({
    queryKey: qk.reporting.evmTimeSeries(projectId),
  });
}
