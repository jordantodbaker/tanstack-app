import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";
import {
  diffFields,
  recordCreate,
  recordDelete,
  recordUpdate,
} from "./audit.server";
import { FCO_TRANSITIONS, availableTransitions } from "./workflow";

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

export type FcoItem = {
  id: number;
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
  linkedCvrNumber: string | null;
  linkedCvrTitle: string | null;
  /** User.id of the creator, or null on rows predating the column. */
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

/** Prisma scalar row, derived from the client so it tracks schema changes. */
type FcoScalarRow = Awaited<
  ReturnType<typeof prisma.fieldChangeOrder.findMany>
>[number];

/** Scalar row plus the `linkedCvr` relation pulled in via `include`. */
type Row = FcoScalarRow & {
  linkedCvr: { id: number; cvrNumber: string; title: string } | null;
};

const toItem = (r: Row): FcoItem => {
  const { linkedCvr, ...rest } = r;
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
  };
};

export const fetchFcoList = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<FcoItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.fieldChangeOrder.findMany({
      where: { projectId },
      include: {
        linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
      },
      orderBy: [{ initiatedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const fcoListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["fcoLog", projectId],
    queryFn: (): Promise<FcoItem[]> =>
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

const linkedCvrInclude = {
  linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
} as const;

export const upsertFco = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertFcoInput) => input)
  .handler(async ({ data }): Promise<FcoItem> => {
    const actor = await requireProjectAccess(data.projectId);
    // `status` is intentionally omitted: lifecycle changes go through
    // `transitionFco`, never the generic upsert. Create falls back to the
    // schema default (DRAFT); update leaves the existing status.
    const payload = {
      projectId: data.projectId,
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
    const id = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const before = await tx.fieldChangeOrder.findUniqueOrThrow({
          where: { id: data.id },
        });
        const updated = await tx.fieldChangeOrder.update({
          where: { id: data.id },
          data: payload,
        });
        await recordUpdate(
          tx,
          {
            entityType: "FieldChangeOrder",
            entityId: updated.id,
            projectId: updated.projectId,
            actor,
          },
          diffFields(before, updated, FCO_AUDIT_FIELDS),
        );
        return updated.id;
      }
      const created = await tx.fieldChangeOrder.create({
        data: { ...payload, createdById: actor.id },
      });
      await recordCreate(tx, {
        entityType: "FieldChangeOrder",
        entityId: created.id,
        projectId: created.projectId,
        actor,
      });
      return created.id;
    });
    // Re-fetch with the relation for the response shape.
    const row = await prisma.fieldChangeOrder.findUniqueOrThrow({
      where: { id },
      include: linkedCvrInclude,
    });
    return toItem(row);
  });

/**
 * Performs a workflow status transition on an FCO. The requested `action` is
 * validated against `FCO_TRANSITIONS` for the actor's role and the
 * originator block. An optional `comment` is stored on the audit event.
 */
export const transitionFco = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: number; action: string; comment?: string }) => input,
  )
  .handler(async ({ data }): Promise<FcoItem> => {
    const pre = await prisma.fieldChangeOrder.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(pre.projectId);
    const id = await prisma.$transaction(async (tx) => {
      const before = await tx.fieldChangeOrder.findUniqueOrThrow({
        where: { id: data.id },
      });
      const isOriginator =
        before.createdById !== null && before.createdById === actor.id;
      const transition = availableTransitions(
        FCO_TRANSITIONS,
        before.status as FcoStatus,
        actor.role,
        isOriginator,
      ).find((t) => t.action === data.action);
      if (!transition) {
        throw new Error(
          `"${data.action}" is not a permitted transition from ${before.status}.`,
        );
      }
      const updated = await tx.fieldChangeOrder.update({
        where: { id: data.id },
        data: { status: transition.to },
      });
      await recordUpdate(
        tx,
        {
          entityType: "FieldChangeOrder",
          entityId: updated.id,
          projectId: updated.projectId,
          actor,
        },
        diffFields(before, updated, ["status"]),
        data.comment,
      );
      return updated.id;
    });
    // Re-fetch with the relation for the response shape.
    const row = await prisma.fieldChangeOrder.findUniqueOrThrow({
      where: { id },
      include: linkedCvrInclude,
    });
    return toItem(row);
  });

export const deleteFco = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    // Resolve the FCO's project first to authorize the caller.
    const row = await prisma.fieldChangeOrder.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(row.projectId);
    await prisma.$transaction(async (tx) => {
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
  .inputValidator((input: { fcoId: number }) => input)
  .handler(async ({ data }): Promise<{ cvrId: number }> => {
    const fco = await prisma.fieldChangeOrder.findUniqueOrThrow({
      where: { id: data.fcoId },
    });
    const actor = await requireProjectAccess(fco.projectId);

    return prisma.$transaction(async (tx) => {
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
  .inputValidator((projectId: number) => projectId)
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
    queryKey: ["cvrOptions", projectId],
    queryFn: () =>
      projectId === null
        ? Promise.resolve([])
        : fetchCvrOptions({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });
