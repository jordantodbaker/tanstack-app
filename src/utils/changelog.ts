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
import { CVR_TRANSITIONS, availableTransitions } from "./workflow";

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

export type ChangeLogItem = {
  id: number;
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
  /** Optional area scope — holds an Area.id as a string. "" = project-wide. */
  area: string;
  /** User.id of the creator, or null on rows predating the column. */
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
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

export const fetchChangeLogList = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<ChangeLogItem[]> => {
    await requireProjectAccess(projectId);
    const rows = await prisma.changeLog.findMany({
      where: { projectId },
      orderBy: [{ requestedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const changeLogListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["changeLog", projectId],
    queryFn: (): Promise<ChangeLogItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchChangeLogList({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
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
  // Note: project access is enforced inside the handler since we need to read
  // `data.projectId` for both create and update paths.
  .handler(async ({ data }): Promise<ChangeLogItem> => {
    const actor = await requireProjectAccess(data.projectId);
    // `status` is intentionally omitted: lifecycle changes go through
    // `transitionChangeLog`, never the generic upsert. Create falls back to
    // the schema default (REQUESTED); update leaves the existing status.
    const payload = {
      projectId: data.projectId,
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
        const updated = await tx.changeLog.update({
          where: { id: data.id },
          data: payload,
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
      const created = await tx.changeLog.create({
        data: { ...payload, createdById: actor.id },
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
    const pre = await prisma.changeLog.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(pre.projectId);
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.changeLog.findUniqueOrThrow({
        where: { id: data.id },
      });
      const isOriginator =
        before.createdById !== null && before.createdById === actor.id;
      const transition = availableTransitions(
        CVR_TRANSITIONS,
        before.status as ChangeStatus,
        actor.role,
        isOriginator,
      ).find((t) => t.action === data.action);
      if (!transition) {
        throw new Error(
          `"${data.action}" is not a permitted transition from ${before.status}.`,
        );
      }
      const updated = await tx.changeLog.update({
        where: { id: data.id },
        data: {
          status: transition.to,
          // Stamp the approver on the approval step only.
          ...(transition.to === "APPROVED"
            ? { approver: actor.email, approvedAt: new Date() }
            : {}),
        },
      });
      await recordUpdate(
        tx,
        {
          entityType: "ChangeLog",
          entityId: updated.id,
          projectId: updated.projectId,
          actor,
        },
        diffFields(before, updated, ["status", "approver", "approvedAt"]),
        data.comment,
      );
      return updated;
    });
    return toItem(row);
  });

export const deleteChangeLog = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    // Look up the row's project to authorize the caller. Throws if they
    // can't access the project this change log belongs to.
    const row = await prisma.changeLog.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(row.projectId);
    await prisma.$transaction(async (tx) => {
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
