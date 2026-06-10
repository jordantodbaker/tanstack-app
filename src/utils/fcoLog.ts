import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { serializeDate } from "~/lib/serialize";
import { invalidateEntityRecordQueries } from "~/lib/invalidate";
import { qk } from "~/lib/query-keys";
import {
  parseIdInput,
  parseIdScalar,
  parseProjectIdInput,
  parsePromoteFcoInput,
  parseTransitionInput,
  parseUpsertFco,
} from "~/lib/validators";
import {
  assertProjectAccess,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import {
  diffFields,
  recordCreate,
  recordDelete,
  recordUpdate,
} from "./audit.server";
import { FCO_TRANSITIONS } from "./workflow";
import { FCO_STATUS_LABELS } from "./fcoLogLabels";
import {
  applyWorkflowTransition,
  type WorkflowTransitionConfig,
} from "./workflow.server";

const FCO_STATUSES_NEEDING_REVIEW = new Set<string>([
  "SUBMITTED",
  "IN_REVIEW",
]);

const FCO_WORKFLOW_CONFIG: WorkflowTransitionConfig<FcoScalarRow, FcoStatus> = {
  entityType: "FieldChangeOrder",
  transitionMap: FCO_TRANSITIONS,
  statusLabels: FCO_STATUS_LABELS,
  statusesNeedingReview: FCO_STATUSES_NEEDING_REVIEW,
  auditFields: ["status"],
  buildTitle: (row) =>
    row.fcoNumber ? `${row.fcoNumber} — ${row.title}` : row.title,
};

export const FCO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "LINKED_TO_CVR",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "CLOSED",
  "VOID",
] as const;
export type FcoStatus = (typeof FCO_STATUSES)[number];

export const FCO_ORIGIN_TYPES = [
  "FIELD_CONDITION",
  "RFI_RESPONSE",
  "DESIGN_OMISSION",
  "DESIGN_CONFLICT",
  "OWNER_DIRECTIVE",
  "SAFETY",
  "REGULATORY",
  "WEATHER",
  "SUBCONTRACTOR",
  "OTHER",
] as const;
export type FcoOriginType = (typeof FCO_ORIGIN_TYPES)[number];

export const FCO_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type FcoPriority = (typeof FCO_PRIORITIES)[number];

export const FCO_OPEN_STATUSES: FcoStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "LINKED_TO_CVR",
];

/**
 * Slim shape used by the list-page table and the dashboard rollups. Drops
 * the five long-text fields (`description`, `reasonNarrative`, `resolution`,
 * `notes`, `photosUrl`) that only the edit dialog and the CSV export need.
 * Per project visits that means ~10× less data over the wire for the table;
 * the dialog refetches the full record on open via `fcoQueryOptions(id)`.
 */
export type FcoListItem = {
  id: number;
  projectId: number;
  fcoNumber: string;
  title: string;
  status: FcoStatus;
  originType: FcoOriginType;
  priority: FcoPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  drawingRefs: string[];
  rfiNumbers: string[];
  initiatedBy: string;
  fieldContact: string;
  estimatedCost: number;
  estimatedHours: number;
  workStopped: boolean;
  initiatedAt: string;
  neededBy: string | null;
  closedAt: string | null;
  linkedCvrId: number | null;
  linkedCvrNumber: string | null;
  linkedCvrTitle: string | null;
  /** Source RFI when this FCO was promoted from one. */
  linkedRfiId: number | null;
  linkedRfiNumber: string | null;
  linkedRfiSubject: string | null;
  /** User.id of the creator, or null on rows predating the column. */
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

export type FcoItem = FcoListItem & {
  description: string;
  reasonNarrative: string;
  resolution: string;
  notes: string;
  photosUrl: string;
};

/** Prisma scalar row, derived from the client so it tracks schema changes. */
type FcoScalarRow = Awaited<
  ReturnType<typeof prisma.fieldChangeOrder.findMany>
>[number];

/** Scalar row plus the `linkedCvr` and `linkedRfi` relations pulled in via `include`. */
type Row = FcoScalarRow & {
  linkedCvr: { id: number; cvrNumber: string; title: string } | null;
  linkedRfi: { id: number; rfiNumber: string; subject: string } | null;
};

const toItem = (r: Row): FcoItem => {
  const { linkedCvr, linkedRfi, ...rest } = r;
  return {
    ...rest,
    status: rest.status as FcoStatus,
    originType: rest.originType as FcoOriginType,
    priority: rest.priority as FcoPriority,
    initiatedAt: rest.initiatedAt.toISOString(),
    neededBy: serializeDate(rest.neededBy),
    closedAt: serializeDate(rest.closedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
    linkedCvrNumber: linkedCvr?.cvrNumber ?? null,
    linkedCvrTitle: linkedCvr?.title ?? null,
    linkedRfiNumber: linkedRfi?.rfiNumber ?? null,
    linkedRfiSubject: linkedRfi?.subject ?? null,
  };
};

/**
 * Prisma `select` for the slim list shape — keep in sync with `FcoListItem`.
 * Omits the five long-text fields the list table and dashboard don't read.
 */
const LIST_SELECT = {
  id: true,
  projectId: true,
  fcoNumber: true,
  title: true,
  status: true,
  originType: true,
  priority: true,
  discipline: true,
  cbsCodes: true,
  locationArea: true,
  drawingRefs: true,
  rfiNumbers: true,
  initiatedBy: true,
  fieldContact: true,
  estimatedCost: true,
  estimatedHours: true,
  workStopped: true,
  initiatedAt: true,
  neededBy: true,
  closedAt: true,
  linkedCvrId: true,
  linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
  linkedRfiId: true,
  linkedRfi: { select: { id: true, rfiNumber: true, subject: true } },
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type FcoListRow = Awaited<
  ReturnType<
    typeof prisma.fieldChangeOrder.findMany<{ select: typeof LIST_SELECT }>
  >
>[number];

const toListItem = (r: FcoListRow): FcoListItem => {
  const { linkedCvr, linkedRfi, ...rest } = r;
  return {
    ...rest,
    status: rest.status as FcoStatus,
    originType: rest.originType as FcoOriginType,
    priority: rest.priority as FcoPriority,
    initiatedAt: rest.initiatedAt.toISOString(),
    neededBy: serializeDate(rest.neededBy),
    closedAt: serializeDate(rest.closedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
    linkedCvrNumber: linkedCvr?.cvrNumber ?? null,
    linkedCvrTitle: linkedCvr?.title ?? null,
    linkedRfiNumber: linkedRfi?.rfiNumber ?? null,
    linkedRfiSubject: linkedRfi?.subject ?? null,
  };
};

export const fetchFcoList = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<FcoListItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.fieldChangeOrder.findMany({
      where: { projectId },
      select: LIST_SELECT,
      orderBy: [{ initiatedAt: "desc" }],
    });
    return rows.map(toListItem);
  });

/**
 * Full list — same rows as `fetchFcoList` but with every column. Used by the
 * CSV export, which legitimately wants the narrative columns. Triggered by
 * the user clicking "Export CSV" so the heavier payload only ships on demand.
 */
export const fetchFcoListFull = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<FcoItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.fieldChangeOrder.findMany({
      where: { projectId },
      include: {
        linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
        linkedRfi: { select: { id: true, rfiNumber: true, subject: true } },
      },
      orderBy: [{ initiatedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const fcoListFullQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.fcoLog.full(projectId),
    queryFn: (): Promise<FcoItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchFcoListFull({ data: projectId }),
    enabled: projectId !== null,
    // Don't auto-fetch; the CSV button triggers this via `fetchQuery`.
    staleTime: 30 * 1000,
  });

/**
 * Single-record fetch — used by the print route, where the caller knows the
 * FCO id but doesn't have the list cached (e.g. opening the print URL
 * directly). Mirrors `fetchChangeLog` over on the CVR side.
 */
export const fetchFco = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data: id }): Promise<FcoItem> => {
    const row = await prisma.fieldChangeOrder.findUniqueOrThrow({
      where: { id },
      include: {
        linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
        linkedRfi: { select: { id: true, rfiNumber: true, subject: true } },
      },
    });
    await requireProjectAccess(row.projectId);
    return toItem(row);
  });

export const fcoQueryOptions = (id: number | null) =>
  queryOptions({
    queryKey: qk.fcoLog.single(id),
    queryFn: (): Promise<FcoItem | null> =>
      id === null ? Promise.resolve(null) : fetchFco({ data: id }),
    enabled: id !== null,
  });

export const fcoListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.fcoLog.list(projectId),
    queryFn: (): Promise<FcoListItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchFcoList({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

export type UpsertFcoInput = {
  id?: number;
  projectId: number;
  fcoNumber: string;
  title: string;
  description: string;
  status: FcoStatus;
  originType: FcoOriginType;
  priority: FcoPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  drawingRefs: string[];
  rfiNumbers: string[];
  initiatedBy: string;
  fieldContact: string;
  estimatedCost: number;
  estimatedHours: number;
  workStopped: boolean;
  photosUrl: string;
  reasonNarrative: string;
  resolution: string;
  notes: string;
  initiatedAt: string;
  neededBy: string | null;
  closedAt: string | null;
  linkedCvrId: number | null;
};

// User-meaningful columns tracked by the audit log. Excludes id, projectId,
// and the createdAt/updatedAt timestamps.
const FCO_AUDIT_FIELDS = [
  "fcoNumber",
  "title",
  "description",
  "status",
  "originType",
  "priority",
  "discipline",
  "cbsCodes",
  "locationArea",
  "drawingRefs",
  "rfiNumbers",
  "initiatedBy",
  "fieldContact",
  "estimatedCost",
  "estimatedHours",
  "workStopped",
  "photosUrl",
  "reasonNarrative",
  "resolution",
  "notes",
  "initiatedAt",
  "neededBy",
  "closedAt",
  "linkedCvrId",
] as const satisfies readonly (keyof FcoScalarRow)[];

const linkedRelationsInclude = {
  linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
  linkedRfi: { select: { id: true, rfiNumber: true, subject: true } },
} as const;

export const upsertFco = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFco)
  .handler(async ({ data }): Promise<FcoItem> => {
    // Resolve the actor once; authorize per-branch inside the transaction
    // against the *actual* project: for creates that's the claimed
    // `data.projectId`; for updates it's the row's existing `projectId`.
    // Trusting `data.projectId` for updates would let a caller with access
    // to project A modify (and reassign) a row that belongs to project B.
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");

    // `status` is intentionally omitted: lifecycle changes go through
    // `transitionFco`, never the generic upsert. Create falls back to the
    // schema default (DRAFT); update leaves the existing status.
    // `projectId` is also omitted — it's set on create only.
    const editableFields = {
      fcoNumber: data.fcoNumber,
      title: data.title,
      description: data.description,
      originType: data.originType,
      priority: data.priority,
      discipline: data.discipline,
      cbsCodes: data.cbsCodes,
      locationArea: data.locationArea,
      drawingRefs: data.drawingRefs,
      rfiNumbers: data.rfiNumbers,
      initiatedBy: data.initiatedBy,
      fieldContact: data.fieldContact,
      estimatedCost: data.estimatedCost,
      estimatedHours: data.estimatedHours,
      workStopped: data.workStopped,
      photosUrl: data.photosUrl,
      reasonNarrative: data.reasonNarrative,
      resolution: data.resolution,
      notes: data.notes,
      initiatedAt: new Date(data.initiatedAt),
      neededBy: data.neededBy ? new Date(data.neededBy) : null,
      closedAt: data.closedAt ? new Date(data.closedAt) : null,
      linkedCvrId: data.linkedCvrId,
    };
    // Run the upsert *with* the linked-relation include so the row that
    // bubbles out of the transaction already carries `linkedCvr` /
    // `linkedRfi`. Previously we returned just the id and re-fetched after
    // the transaction — an extra round-trip per write that this avoids.
    // `before` stays scalar (no include) since the audit diff only inspects
    // FCO_AUDIT_FIELDS, which are all scalar columns.
    const row = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const before = await tx.fieldChangeOrder.findUniqueOrThrow({
          where: { id: data.id },
        });
        await assertProjectAccess(actor, before.projectId);
        // Cross-project moves aren't a supported operation on the generic
        // upsert. Disallow rather than silently dropping the input.
        if (data.projectId !== before.projectId) {
          throw new Error(
            "Cannot move this FCO to a different project.",
          );
        }
        const updated = await tx.fieldChangeOrder.update({
          where: { id: data.id },
          data: editableFields,
          include: linkedRelationsInclude,
        });
        await recordUpdate(
          tx,
          {
            entityType: "FieldChangeOrder",
            entityId: updated.id,
            projectId: updated.projectId,
            actor,
          },
          diffFields(before, updated as FcoScalarRow, FCO_AUDIT_FIELDS),
        );
        return updated;
      }
      await assertProjectAccess(actor, data.projectId);
      const created = await tx.fieldChangeOrder.create({
        data: {
          ...editableFields,
          projectId: data.projectId,
          createdById: actor.id,
        },
        include: linkedRelationsInclude,
      });
      await recordCreate(tx, {
        entityType: "FieldChangeOrder",
        entityId: created.id,
        projectId: created.projectId,
        actor,
      });
      return created;
    });
    return toItem(row);
  });

/**
 * Performs a workflow status transition on an FCO. The requested `action` is
 * validated against `FCO_TRANSITIONS` for the actor's role and the
 * originator block. An optional `comment` is stored on the audit event.
 */
export const transitionFco = createServerFn({ method: "POST" })
  .inputValidator(parseTransitionInput)
  .handler(async ({ data }): Promise<FcoItem> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    // Read `before` and write `updated` with the linked-relation include so
    // both ends of the workflow transition carry the relations needed by
    // toItem. Eliminates the post-tx re-fetch round-trip that previously
    // followed this transaction. `applyWorkflowTransition`'s Row generic
    // infers to the with-relations shape; the audit diff (config.auditFields)
    // names scalar columns only, which are still valid keys on the wider row.
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.fieldChangeOrder.findUniqueOrThrow({
        where: { id: data.id },
        include: linkedRelationsInclude,
      });
      await assertProjectAccess(actor, before.projectId);
      return applyWorkflowTransition({
        tx,
        before,
        actor,
        action: data.action,
        comment: data.comment,
        config: FCO_WORKFLOW_CONFIG,
        updateRow: (payload) =>
          tx.fieldChangeOrder.update({
            where: { id: data.id },
            data: payload,
            include: linkedRelationsInclude,
          }),
      });
    });
    return toItem(row);
  });

export const deleteFco = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    await prisma.$transaction(async (tx) => {
      const row = await tx.fieldChangeOrder.findUniqueOrThrow({
        where: { id: data.id },
        select: { projectId: true },
      });
      await assertProjectAccess(actor, row.projectId);
      await tx.fieldChangeOrder.delete({ where: { id: data.id } });
      await recordDelete(tx, {
        entityType: "FieldChangeOrder",
        entityId: data.id,
        projectId: row.projectId,
        actor,
      });
    });
    return { ok: true };
  });

/**
 * Promote an FCO to a CVR in the Change Log. Creates a new ChangeLog row
 * pre-populated from the FCO, links them, and flips the FCO status to
 * LINKED_TO_CVR. Returns the new CVR id so callers can navigate to it.
 */
export const promoteFcoToCvr = createServerFn({ method: "POST" })
  .inputValidator(parsePromoteFcoInput)
  .handler(async ({ data }): Promise<{ cvrId: number }> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");

    return prisma.$transaction(async (tx) => {
      const fco = await tx.fieldChangeOrder.findUniqueOrThrow({
        where: { id: data.fcoId },
      });
      await assertProjectAccess(actor, fco.projectId);
      const cvr = await tx.changeLog.create({
        data: {
          projectId: fco.projectId,
          cvrNumber: fco.fcoNumber ? `CVR-from-${fco.fcoNumber}` : "",
          title: fco.title,
          description:
            fco.description ||
            fco.reasonNarrative ||
            `Promoted from FCO ${fco.fcoNumber}`,
          status: "REQUESTED",
          type: "SCOPE",
          discipline: fco.discipline,
          cbsCodes: fco.cbsCodes,
          originator: fco.initiatedBy,
          costImpact: fco.estimatedCost,
          scheduleDaysImpact: 0,
          laborHoursImpact: fco.estimatedHours,
          riskLevel:
            fco.priority === "URGENT"
              ? "CRITICAL"
              : fco.priority === "HIGH"
                ? "HIGH"
                : fco.priority === "LOW"
                  ? "LOW"
                  : "MEDIUM",
          reasonCode: fco.originType,
          requestedAt: new Date(),
          notes: `Linked from FCO ${fco.fcoNumber || `#${fco.id}`}`,
          // Carry the FCO's area through to the new CVR so the change keeps
          // its location context after escalation.
          area: fco.locationArea,
          createdById: actor.id,
        },
      });
      await recordCreate(tx, {
        entityType: "ChangeLog",
        entityId: cvr.id,
        projectId: cvr.projectId,
        actor,
      });

      const updatedFco = await tx.fieldChangeOrder.update({
        where: { id: fco.id },
        data: { linkedCvrId: cvr.id, status: "LINKED_TO_CVR" },
      });
      await recordUpdate(
        tx,
        {
          entityType: "FieldChangeOrder",
          entityId: fco.id,
          projectId: fco.projectId,
          actor,
        },
        diffFields(fco, updatedFco, ["status", "linkedCvrId"] as const),
      );

      return { cvrId: cvr.id };
    });
  });

/**
 * Lightweight CVR options for the "link existing CVR" picker in the FCO
 * dialog. Returns id + label only so the dropdown stays cheap.
 */
export const fetchCvrOptions = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(
    async ({
      data: projectId,
    }): Promise<{ id: number; cvrNumber: string; title: string }[]> => {
      await requireProjectAccess(projectId);
      const rows = await prisma.changeLog.findMany({
        where: { projectId },
        select: { id: true, cvrNumber: true, title: true },
        orderBy: [{ requestedAt: "desc" }],
      });
      return rows;
    },
  );

export const cvrOptionsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: qk.changeLog.cvrOptions(projectId),
    queryFn: () =>
      projectId === null
        ? Promise.resolve([])
        : fetchCvrOptions({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

/**
 * Cache-bust set fired after every FCO mutation. Lives here so the FCO
 * module owns the fan-out — callers shouldn't have to remember the dashboard
 * summary key. `promoteFcoToCvr` mints a CVR; for that case the caller pairs
 * this with `invalidateChangeLogQueries`.
 */
export function invalidateFcoQueries(
  queryClient: QueryClient,
  projectId: number | null,
): void {
  invalidateEntityRecordQueries(queryClient, {
    list: qk.fcoLog.list(projectId),
    full: qk.fcoLog.full(projectId),
    singleAll: qk.fcoLog.singleAll(),
  });
  queryClient.invalidateQueries({ queryKey: qk.dashboardSummary(projectId) });
}
