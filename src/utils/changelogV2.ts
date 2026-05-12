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

export type ChangeLogV2Item = {
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

const toItem = (r: {
  id: number;
  projectId: number;
  cvrNumber: string;
  title: string;
  description: string;
  status: string;
  type: string;
  discipline: string;
  cbsCodes: string[];
  originator: string;
  costImpact: number;
  scheduleDaysImpact: number;
  laborHoursImpact: number;
  riskLevel: string;
  reasonCode: string;
  requestedAt: Date;
  dueDate: Date | null;
  approvedAt: Date | null;
  approver: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}): ChangeLogV2Item => ({
  id: r.id,
  projectId: r.projectId,
  cvrNumber: r.cvrNumber,
  title: r.title,
  description: r.description,
  status: r.status as ChangeStatus,
  type: r.type as ChangeType,
  discipline: r.discipline,
  cbsCodes: r.cbsCodes,
  originator: r.originator,
  costImpact: r.costImpact,
  scheduleDaysImpact: r.scheduleDaysImpact,
  laborHoursImpact: r.laborHoursImpact,
  riskLevel: r.riskLevel as RiskLevel,
  reasonCode: r.reasonCode,
  requestedAt: r.requestedAt.toISOString(),
  dueDate: serializeDate(r.dueDate),
  approvedAt: serializeDate(r.approvedAt),
  approver: r.approver,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const fetchChangeLogV2List = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<ChangeLogV2Item[]> => {
    const rows = await prisma.changeLogV2.findMany({
      where: { projectId },
      orderBy: [{ requestedAt: "desc" }],
    });
    return rows.map(toItem);
  });

export const changeLogV2ListQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["changeLogV2", projectId],
    queryFn: (): Promise<ChangeLogV2Item[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchChangeLogV2List({ data: projectId }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

export type UpsertChangeLogV2Input = {
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

export const upsertChangeLogV2 = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertChangeLogV2Input) => input)
  .handler(async ({ data }): Promise<ChangeLogV2Item> => {
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
      ? await prisma.changeLogV2.update({
          where: { id: data.id },
          data: payload,
        })
      : await prisma.changeLogV2.create({ data: payload });
    return toItem(row);
  });

export const deleteChangeLogV2 = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await prisma.changeLogV2.delete({ where: { id: data.id } });
    return { ok: true };
  });
