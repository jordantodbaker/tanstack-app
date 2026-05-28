import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";
import { diffFields, recordCreate, recordDelete, recordUpdate } from "./audit.server";
import { applyWorkflowTransition } from "./workflow.server";
import { RFI_TRANSITIONS } from "./workflow";
import { RFI_STATUS_LABELS } from "./rfiLabels";

export const RFI_STATUSES = [
  "DRAFT",
  "OPEN",
  "ANSWERED",
  "CLOSED",
  "SUPERSEDED",
  "VOID",
] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

/** RFIs still expecting attention — drafts, open questions, awaiting close. */
export const RFI_OPEN_STATUSES: RfiStatus[] = ["DRAFT", "OPEN", "ANSWERED"];

export const RFI_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type RfiPriority = (typeof RFI_PRIORITIES)[number];

/**
 * Slim shape used by the list-page table and the dashboard rollups. Drops
 * the two long-text fields (`question`, `response`) that only the edit
 * dialog and the CSV export need. The dialog refetches the full record on
 * open via `rfiQueryOptions(id)`.
 */
export type RfiListItem = {
  id: number;
  projectId: number;
  rfiNumber: string;
  subject: string;
  status: RfiStatus;
  priority: RfiPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  drawingRefs: string[];
  specRefs: string[];
  suspectsCostImpact: boolean;
  suspectsScheduleImpact: boolean;
  initiatedBy: string;
  assignedTo: string;
  dueDate: string | null;
  initiatedAt: string;
  answeredBy: string;
  answeredAt: string | null;
  closedAt: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  /** FCOs promoted from this RFI. Empty array when none. */
  linkedFcos: { id: number; fcoNumber: string; title: string; status: string }[];
};

export type RfiItem = RfiListItem & {
  question: string;
  response: string;
};

const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

/** Include used by both list and single-record fetches to populate `linkedFcos`. */
const linkedFcosInclude = {
  linkedFcos: {
    select: { id: true, fcoNumber: true, title: true, status: true },
  },
} as const;

type RfiScalarRow = Awaited<ReturnType<typeof prisma.rfi.findMany>>[number];
type RfiWithLinks = RfiScalarRow & {
  linkedFcos: { id: number; fcoNumber: string; title: string; status: string }[];
};

const toItem = (r: RfiWithLinks): RfiItem => {
  const { linkedFcos, ...rest } = r;
  return {
    ...rest,
    status: rest.status as RfiStatus,
    priority: rest.priority as RfiPriority,
    dueDate: serializeDate(rest.dueDate),
    initiatedAt: rest.initiatedAt.toISOString(),
    answeredAt: serializeDate(rest.answeredAt),
    closedAt: serializeDate(rest.closedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
    linkedFcos,
  };
};

/**
 * Prisma `select` for the slim list shape — keep in sync with `RfiListItem`.
 * Omits `question` and `response`, which only the edit dialog and CSV need.
 */
const LIST_SELECT = {
  id: true,
  projectId: true,
  rfiNumber: true,
  subject: true,
  status: true,
  priority: true,
  discipline: true,
  cbsCodes: true,
  locationArea: true,
  drawingRefs: true,
  specRefs: true,
  suspectsCostImpact: true,
  suspectsScheduleImpact: true,
  initiatedBy: true,
  assignedTo: true,
  dueDate: true,
  initiatedAt: true,
  answeredBy: true,
  answeredAt: true,
  closedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  linkedFcos: {
    select: { id: true, fcoNumber: true, title: true, status: true },
  },
} as const;

type RfiListRow = Awaited<
  ReturnType<typeof prisma.rfi.findMany<{ select: typeof LIST_SELECT }>>
>[number];

const toListItem = (r: RfiListRow): RfiListItem => {
  const { linkedFcos, ...rest } = r;
  return {
    ...rest,
    status: rest.status as RfiStatus,
    priority: rest.priority as RfiPriority,
    dueDate: serializeDate(rest.dueDate),
    initiatedAt: rest.initiatedAt.toISOString(),
    answeredAt: serializeDate(rest.answeredAt),
    closedAt: serializeDate(rest.closedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
    linkedFcos,
  };
};

export const fetchRfiList = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<RfiListItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.rfi.findMany({
      where: { projectId },
      select: LIST_SELECT,
      orderBy: [{ initiatedAt: "desc" }],
    });
    return rows.map(toListItem);
  });

export const rfiListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["rfis", projectId],
    queryFn: (): Promise<RfiListItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchRfiList({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

/**
 * Full list — every column. Triggered by the CSV export button on click so
 * the long-text columns only ship when the user actually needs them.
 */
export const fetchRfiListFull = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<RfiItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.rfi.findMany({
      where: { projectId },
      include: linkedFcosInclude,
      orderBy: [{ initiatedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const rfiListFullQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["rfis", "full", projectId],
    queryFn: (): Promise<RfiItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchRfiListFull({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

/**
 * Single-record fetch — used by the print route (a follow-up phase) and any
 * caller that knows the id but doesn't have the list cached. Mirrors
 * `fetchFco` / `fetchChangeLog`.
 */
export const fetchRfi = createServerFn({ method: "GET" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }): Promise<RfiItem> => {
    const row = await prisma.rfi.findUniqueOrThrow({
      where: { id },
      include: linkedFcosInclude,
    });
    await requireProjectAccess(row.projectId);
    return toItem(row);
  });

export const rfiQueryOptions = (id: number | null) =>
  queryOptions({
    queryKey: ["rfis", "single", id],
    queryFn: (): Promise<RfiItem | null> =>
      id === null ? Promise.resolve(null) : fetchRfi({ data: id }),
    enabled: id !== null,
  });

export type UpsertRfiInput = {
  id?: number;
  projectId: number;
  rfiNumber: string;
  subject: string;
  question: string;
  priority: RfiPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  drawingRefs: string[];
  specRefs: string[];
  suspectsCostImpact: boolean;
  suspectsScheduleImpact: boolean;
  initiatedBy: string;
  assignedTo: string;
  dueDate: string | null;
  initiatedAt: string;
  // Response side — editable by the responder; status moves via transitions.
  response: string;
  answeredBy: string;
};

// User-meaningful columns tracked by the audit log. Excludes id, projectId,
// timestamps, and the createdAt/updatedAt mirrors.
const RFI_AUDIT_FIELDS = [
  "rfiNumber",
  "subject",
  "question",
  "status",
  "priority",
  "discipline",
  "cbsCodes",
  "locationArea",
  "drawingRefs",
  "specRefs",
  "suspectsCostImpact",
  "suspectsScheduleImpact",
  "initiatedBy",
  "assignedTo",
  "dueDate",
  "initiatedAt",
  "response",
  "answeredBy",
  "answeredAt",
  "closedAt",
] as const satisfies readonly (keyof RfiScalarRow)[];

export const upsertRfi = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertRfiInput) => input)
  .handler(async ({ data }): Promise<RfiItem> => {
    const actor = await requireProjectAccess(data.projectId);
    // `status` is intentionally omitted from the payload: lifecycle changes
    // go through `transitionRfi`, never the generic upsert. Create falls
    // back to the schema default (DRAFT); update leaves the existing status.
    const payload = {
      projectId: data.projectId,
      rfiNumber: data.rfiNumber,
      subject: data.subject,
      question: data.question,
      priority: data.priority,
      discipline: data.discipline,
      cbsCodes: data.cbsCodes,
      locationArea: data.locationArea,
      drawingRefs: data.drawingRefs,
      specRefs: data.specRefs,
      suspectsCostImpact: data.suspectsCostImpact,
      suspectsScheduleImpact: data.suspectsScheduleImpact,
      initiatedBy: data.initiatedBy,
      assignedTo: data.assignedTo,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      initiatedAt: new Date(data.initiatedAt),
      response: data.response,
      answeredBy: data.answeredBy,
    };
    const id = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const before = await tx.rfi.findUniqueOrThrow({
          where: { id: data.id },
        });
        const updated = await tx.rfi.update({
          where: { id: data.id },
          data: payload,
        });
        await recordUpdate(
          tx,
          {
            entityType: "Rfi",
            entityId: updated.id,
            projectId: updated.projectId,
            actor,
          },
          diffFields(before, updated, RFI_AUDIT_FIELDS),
        );
        return updated.id;
      }
      const created = await tx.rfi.create({
        data: { ...payload, createdById: actor.id },
      });
      await recordCreate(tx, {
        entityType: "Rfi",
        entityId: created.id,
        projectId: created.projectId,
        actor,
      });
      return created.id;
    });
    // Re-fetch with the include so the response carries `linkedFcos`.
    const row = await prisma.rfi.findUniqueOrThrow({
      where: { id },
      include: linkedFcosInclude,
    });
    return toItem(row);
  });

// RFI workflow doesn't use the APPROVER role — it's question/answer, not
// approval. No status fans out to reviewers; the originator still gets a
// notification on every transition (via `originatorId` in the orchestrator).
const RFI_STATUSES_NEEDING_REVIEW: ReadonlySet<string> = new Set();

export const transitionRfi = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: number; action: string; comment?: string }) => input,
  )
  .handler(async ({ data }): Promise<RfiItem> => {
    const pre = await prisma.rfi.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(pre.projectId);
    const id = await prisma.$transaction(async (tx) => {
      const before = await tx.rfi.findUniqueOrThrow({ where: { id: data.id } });
      const updated = await applyWorkflowTransition({
        tx,
        before,
        actor,
        action: data.action,
        comment: data.comment,
        config: {
          entityType: "Rfi",
          transitionMap: RFI_TRANSITIONS,
          statusLabels: RFI_STATUS_LABELS,
          statusesNeedingReview: RFI_STATUSES_NEEDING_REVIEW,
          auditFields: ["status", "answeredBy", "answeredAt", "closedAt"],
          buildTitle: (r) => `${r.rfiNumber || `RFI #${r.id}`} — ${r.subject}`,
          // Stamp the responder + answeredAt when landing in ANSWERED; the
          // closedAt timestamp when landing in CLOSED. Saves a separate
          // UPDATE round-trip after the workflow action.
          extraUpdateData: (transition, actor) =>
            transition.to === "ANSWERED"
              ? { answeredBy: actor.email, answeredAt: new Date() }
              : transition.to === "CLOSED"
                ? { closedAt: new Date() }
                : {},
        },
        updateRow: (data) =>
          tx.rfi.update({ where: { id: before.id }, data }),
      });
      return updated.id;
    });
    // Re-fetch with the include so the response carries `linkedFcos`.
    const row = await prisma.rfi.findUniqueOrThrow({
      where: { id },
      include: linkedFcosInclude,
    });
    return toItem(row);
  });

/**
 * Promote an RFI to an FCO in the Field Change Order log. Creates a new
 * FCO pre-populated from the RFI (discipline, area, drawings, originType =
 * RFI_RESPONSE, the RFI's number echoed into the legacy `rfiNumbers` array)
 * with `linkedRfiId` pointing back. Returns the new FCO id so callers can
 * navigate.
 *
 * Does not change the RFI's status — the originator decides when to close
 * the RFI separately. One RFI can spawn multiple FCOs; no uniqueness
 * constraint blocks a second promotion.
 */
export const promoteRfiToFco = createServerFn({ method: "POST" })
  .inputValidator((input: { rfiId: number }) => input)
  .handler(async ({ data }): Promise<{ fcoId: number }> => {
    const rfi = await prisma.rfi.findUniqueOrThrow({
      where: { id: data.rfiId },
    });
    const actor = await requireProjectAccess(rfi.projectId);

    return prisma.$transaction(async (tx) => {
      const fco = await tx.fieldChangeOrder.create({
        data: {
          projectId: rfi.projectId,
          fcoNumber: "",
          title: rfi.subject,
          description: rfi.question,
          // Status defaults to DRAFT via the schema; do not pass it here so
          // the FCO opens for the originator to flesh out before submitting.
          originType: "RFI_RESPONSE",
          priority:
            rfi.priority === "URGENT"
              ? "URGENT"
              : rfi.priority === "HIGH"
                ? "HIGH"
                : rfi.priority === "LOW"
                  ? "LOW"
                  : "NORMAL",
          discipline: rfi.discipline,
          cbsCodes: rfi.cbsCodes,
          locationArea: rfi.locationArea,
          drawingRefs: rfi.drawingRefs,
          // Legacy free-text reference echoes the RFI number; the real link
          // is `linkedRfiId`.
          rfiNumbers: rfi.rfiNumber ? [rfi.rfiNumber] : [],
          initiatedBy: actor.email,
          fieldContact: "",
          estimatedCost: 0,
          estimatedHours: 0,
          workStopped: false,
          photosUrl: "",
          reasonNarrative: rfi.question,
          resolution: "",
          notes: `Promoted from RFI ${rfi.rfiNumber || `#${rfi.id}`}`,
          initiatedAt: new Date(),
          linkedRfiId: rfi.id,
          createdById: actor.id,
        },
      });
      await recordCreate(tx, {
        entityType: "FieldChangeOrder",
        entityId: fco.id,
        projectId: fco.projectId,
        actor,
      });
      // Surface the promotion on the RFI's audit timeline so reviewers see
      // it without opening the FCO log. Synthetic field — the RFI itself
      // wasn't modified.
      await recordUpdate(
        tx,
        {
          entityType: "Rfi",
          entityId: rfi.id,
          projectId: rfi.projectId,
          actor,
        },
        [
          {
            field: "linkedFcos",
            oldValue: null,
            newValue: fco.fcoNumber || `FCO #${fco.id}`,
          },
        ],
      );
      return { fcoId: fco.id };
    });
  });

export const deleteRfi = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const row = await prisma.rfi.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(row.projectId);
    await prisma.$transaction(async (tx) => {
      await tx.rfi.delete({ where: { id: data.id } });
      await recordDelete(tx, {
        entityType: "Rfi",
        entityId: data.id,
        projectId: row.projectId,
        actor,
      });
    });
    return { ok: true };
  });
