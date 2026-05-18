import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

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
};

export const upsertChangeLog = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertChangeLogInput) => input)
  .handler(async ({ data }): Promise<ChangeLogItem> => {
    const payload = {
      projectId: data.projectId,
      cvrNumber: data.cvrNumber,
      title: data.title,
      description: data.description,
      status: data.status,
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
    };
    const row = data.id
      ? await prisma.changeLog.update({
          where: { id: data.id },
          data: payload,
        })
      : await prisma.changeLog.create({ data: payload });
    return toItem(row);
  });

export const deleteChangeLog = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await prisma.changeLog.delete({ where: { id: data.id } });
    return { ok: true };
  });
