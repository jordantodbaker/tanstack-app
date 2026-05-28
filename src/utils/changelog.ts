import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
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
import { CVR_TRANSITIONS } from "./workflow";
import { STATUS_LABELS } from "./changelogLabels";
import {
  applyWorkflowTransition,
  type WorkflowTransitionConfig,
} from "./workflow.server";

const CVR_STATUSES_NEEDING_REVIEW = new Set<string>([
  "IN_REVIEW",
  "PENDING_APPROVAL",
]);

const CVR_WORKFLOW_CONFIG: WorkflowTransitionConfig<ChangeLogRow, ChangeStatus> = {
  entityType: "ChangeLog",
  transitionMap: CVR_TRANSITIONS,
  statusLabels: STATUS_LABELS,
  statusesNeedingReview: CVR_STATUSES_NEEDING_REVIEW,
  // Status is always diffed; approver/approvedAt only change on the APPROVED
  // step but live in the diff set so the audit row picks them up when they do.
  auditFields: ["status", "approver", "approvedAt"],
  buildTitle: (row) =>
    row.cvrNumber ? `${row.cvrNumber} — ${row.title}` : row.title,
  extraUpdateData: (transition, actor) =>
    transition.to === "APPROVED"
      ? { approver: actor.email, approvedAt: new Date() }
      : {},
};

export const CHANGE_STATUSES = [
  "REQUESTED",
  "IN_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "VOID",
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** CVR statuses still in flight — not yet executed, rejected, or voided. */
export const CVR_OPEN_STATUSES: ChangeStatus[] = [
  "REQUESTED",
  "IN_REVIEW",
  "PENDING_APPROVAL",
];

export const CHANGE_TYPES = [
  "SCOPE",
  "COST",
  "SCHEDULE",
  "ENGINEERING",
  "CONSTRUCTION",
  "PROCUREMENT",
  "REGULATORY",
  "OTHER",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Slim shape used by the list table and dashboard. Drops `description`,
 * `notes`, `reasonCode` — only the dialog and CSV export need them. The
 * dialog refetches the full record on open via `changeLogQueryOptions(id)`.
 */
export type ChangeLogListItem = {
  id: number;
  projectId: number;
  cvrNumber: string;
  title: string;
  status: ChangeStatus;
  type: ChangeType;
  discipline: string;
  cbsCodes: string[];
  originator: string;
  costImpact: number;
  scheduleDaysImpact: number;
  laborHoursImpact: number;
  riskLevel: RiskLevel;
  requestedAt: string;
  dueDate: string | null;
  approvedAt: string | null;
  approver: string;
  /** Optional area scope — holds an Area.id as a string. "" = project-wide. */
  area: string;
  /** User.id of the creator, or null on rows predating the column. */
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ChangeLogItem = ChangeLogListItem & {
  description: string;
  notes: string;
  reasonCode: string;
};

const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

/** Prisma row shape, derived from the client so it tracks schema changes. */
type ChangeLogRow = Awaited<
  ReturnType<typeof prisma.changeLog.findMany>
>[number];

const toItem = (r: ChangeLogRow): ChangeLogItem => ({
  ...r,
  status: r.status as ChangeStatus,
  type: r.type as ChangeType,
  riskLevel: r.riskLevel as RiskLevel,
  requestedAt: r.requestedAt.toISOString(),
  dueDate: serializeDate(r.dueDate),
  approvedAt: serializeDate(r.approvedAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * Prisma `select` for the slim list shape — keep in sync with
 * `ChangeLogListItem`. Omits `description`, `notes`, `reasonCode` (heavy
 * text only the dialog and CSV need).
 */
const LIST_SELECT = {
  id: true,
  projectId: true,
  cvrNumber: true,
  title: true,
  status: true,
  type: true,
  discipline: true,
  cbsCodes: true,
  originator: true,
  costImpact: true,
  scheduleDaysImpact: true,
  laborHoursImpact: true,
  riskLevel: true,
  requestedAt: true,
  dueDate: true,
  approvedAt: true,
  approver: true,
  area: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ChangeLogListRow = Awaited<
  ReturnType<typeof prisma.changeLog.findMany<{ select: typeof LIST_SELECT }>>
>[number];

const toListItem = (r: ChangeLogListRow): ChangeLogListItem => ({
  ...r,
  status: r.status as ChangeStatus,
  type: r.type as ChangeType,
  riskLevel: r.riskLevel as RiskLevel,
  requestedAt: r.requestedAt.toISOString(),
  dueDate: serializeDate(r.dueDate),
  approvedAt: serializeDate(r.approvedAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const fetchChangeLogList = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<ChangeLogListItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.changeLog.findMany({
      where: { projectId },
      select: LIST_SELECT,
      orderBy: [{ requestedAt: "desc" }],
    });
    return rows.map(toListItem);
  });

export const changeLogListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["changeLog", projectId],
    queryFn: (): Promise<ChangeLogListItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchChangeLogList({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

/**
 * Full list — every column. Triggered by the CSV export button on click.
 */
export const fetchChangeLogListFull = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<ChangeLogItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.changeLog.findMany({
      where: { projectId },
      orderBy: [{ requestedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const changeLogListFullQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["changeLog", "full", projectId],
    queryFn: (): Promise<ChangeLogItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchChangeLogListFull({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

/**
 * Single-CVR fetcher used by the printable detail view (`/changelog/print/$id`).
 * The list query is the hot path; this one only loads when a user opens the
 * print URL directly (bookmarked, emailed, etc.) so it has no caching beyond
 * React Query defaults.
 */
export const fetchChangeLog = createServerFn({ method: "GET" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }): Promise<ChangeLogItem> => {
    const row = await prisma.changeLog.findUniqueOrThrow({
      where: { id },
    });
    await requireProjectAccess(row.projectId);
    return toItem(row);
  });

export const changeLogQueryOptions = (id: number | null) =>
  queryOptions({
    queryKey: ["changeLog", "single", id],
    queryFn: (): Promise<ChangeLogItem | null> =>
      id === null ? Promise.resolve(null) : fetchChangeLog({ data: id }),
    enabled: id !== null,
  });

export type UpsertChangeLogInput = {
  id?: number;
  projectId: number;
  cvrNumber: string;
  title: string;
  description: string;
  status: ChangeStatus;
  type: ChangeType;
  discipline: string;
  cbsCodes: string[];
  originator: string;
  costImpact: number;
  scheduleDaysImpact: number;
  laborHoursImpact: number;
  riskLevel: RiskLevel;
  reasonCode: string;
  requestedAt: string;
  dueDate: string | null;
  approvedAt: string | null;
  approver: string;
  notes: string;
  area: string;
};

// User-meaningful columns tracked by the audit log. Excludes id, projectId,
// and the createdAt/updatedAt timestamps.
const CHANGELOG_AUDIT_FIELDS = [
  "cvrNumber",
  "title",
  "description",
  "status",
  "type",
  "discipline",
  "cbsCodes",
  "originator",
  "costImpact",
  "scheduleDaysImpact",
  "laborHoursImpact",
  "riskLevel",
  "reasonCode",
  "requestedAt",
  "dueDate",
  "approvedAt",
  "approver",
  "notes",
  "area",
] as const satisfies readonly (keyof ChangeLogRow)[];

export const upsertChangeLog = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertChangeLogInput) => input)
  .handler(async ({ data }): Promise<ChangeLogItem> => {
    // Resolve the actor once; authorize per-branch inside the transaction
    // against the *actual* project: for creates that's the claimed
    // `data.projectId`; for updates it's the row's existing `projectId`.
    // Trusting `data.projectId` for updates would let a caller with access
    // to project A modify (and reassign) a row that belongs to project B.
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");

    // `status` is intentionally omitted: lifecycle changes go through
    // `transitionChangeLog`, never the generic upsert. Create falls back to
    // the schema default (REQUESTED); update leaves the existing status.
    // `projectId` is also omitted here — it's set on create only.
    const editableFields = {
      cvrNumber: data.cvrNumber,
      title: data.title,
      description: data.description,
      type: data.type,
      discipline: data.discipline,
      cbsCodes: data.cbsCodes,
      originator: data.originator,
      costImpact: data.costImpact,
      scheduleDaysImpact: data.scheduleDaysImpact,
      laborHoursImpact: data.laborHoursImpact,
      riskLevel: data.riskLevel,
      reasonCode: data.reasonCode,
      requestedAt: new Date(data.requestedAt),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : null,
      approver: data.approver,
      notes: data.notes,
      area: data.area,
    };
    const row = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const before = await tx.changeLog.findUniqueOrThrow({
          where: { id: data.id },
        });
        await assertProjectAccess(actor, before.projectId);
        // Cross-project moves aren't a supported operation on the generic
        // upsert. Disallow rather than silently dropping the input so a
        // confused client surfaces the mismatch instead of "saving" against
        // the wrong project.
        if (data.projectId !== before.projectId) {
          throw new Error(
            "Cannot move this change item to a different project.",
          );
        }
        const updated = await tx.changeLog.update({
          where: { id: data.id },
          data: editableFields,
        });
        await recordUpdate(
          tx,
          {
            entityType: "ChangeLog",
            entityId: updated.id,
            projectId: updated.projectId,
            actor,
          },
          diffFields(before, updated, CHANGELOG_AUDIT_FIELDS),
        );
        return updated;
      }
      await assertProjectAccess(actor, data.projectId);
      const created = await tx.changeLog.create({
        data: {
          ...editableFields,
          projectId: data.projectId,
          createdById: actor.id,
        },
      });
      await recordCreate(tx, {
        entityType: "ChangeLog",
        entityId: created.id,
        projectId: created.projectId,
        actor,
      });
      return created;
    });
    return toItem(row);
  });

/**
 * Performs a workflow status transition on a CVR. The requested `action` is
 * validated against `CVR_TRANSITIONS` for the actor's role and the
 * originator block — the same source of truth the UI renders buttons from.
 * An optional `comment` is stored on the audit event as its note.
 */
export const transitionChangeLog = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: number; action: string; comment?: string }) => input,
  )
  .handler(async ({ data }): Promise<ChangeLogItem> => {
    // Resolve the actor once up front; we read the row inside the
    // transaction (avoiding a pre-read round-trip just to discover its
    // `projectId` for the access check).
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.changeLog.findUniqueOrThrow({
        where: { id: data.id },
      });
      await assertProjectAccess(actor, before.projectId);
      return applyWorkflowTransition({
        tx,
        before,
        actor,
        action: data.action,
        comment: data.comment,
        config: CVR_WORKFLOW_CONFIG,
        updateRow: (payload) =>
          tx.changeLog.update({ where: { id: data.id }, data: payload }),
      });
    });
    return toItem(row);
  });

export const deleteChangeLog = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    await prisma.$transaction(async (tx) => {
      // Single read for projectId + access check, then delete + audit.
      // Doing the lookup inside the transaction also closes the race where
      // a row's project could be reassigned between the access check and
      // the delete.
      const row = await tx.changeLog.findUniqueOrThrow({
        where: { id: data.id },
        select: { projectId: true },
      });
      await assertProjectAccess(actor, row.projectId);
      await tx.changeLog.delete({ where: { id: data.id } });
      await recordDelete(tx, {
        entityType: "ChangeLog",
        entityId: data.id,
        projectId: row.projectId,
        actor,
      });
    });
    return { ok: true };
  });
