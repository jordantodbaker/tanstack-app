import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

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
  createdAt: string;
  updatedAt: string;
};

const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

type Row = {
  id: number;
  projectId: number;
  fcoNumber: string;
  title: string;
  description: string;
  status: string;
  originType: string;
  priority: string;
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
  initiatedAt: Date;
  neededBy: Date | null;
  closedAt: Date | null;
  linkedCvrId: number | null;
  linkedCvr: { id: number; cvrNumber: string; title: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

const toItem = (r: Row): FcoItem => ({
  id: r.id,
  projectId: r.projectId,
  fcoNumber: r.fcoNumber,
  title: r.title,
  description: r.description,
  status: r.status as FcoStatus,
  originType: r.originType as FcoOriginType,
  priority: r.priority as FcoPriority,
  discipline: r.discipline,
  cbsCodes: r.cbsCodes,
  locationArea: r.locationArea,
  drawingRefs: r.drawingRefs,
  rfiNumbers: r.rfiNumbers,
  initiatedBy: r.initiatedBy,
  fieldContact: r.fieldContact,
  estimatedCost: r.estimatedCost,
  estimatedHours: r.estimatedHours,
  workStopped: r.workStopped,
  photosUrl: r.photosUrl,
  reasonNarrative: r.reasonNarrative,
  resolution: r.resolution,
  notes: r.notes,
  initiatedAt: r.initiatedAt.toISOString(),
  neededBy: serializeDate(r.neededBy),
  closedAt: serializeDate(r.closedAt),
  linkedCvrId: r.linkedCvrId,
  linkedCvrNumber: r.linkedCvr?.cvrNumber ?? null,
  linkedCvrTitle: r.linkedCvr?.title ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const fetchFcoList = createServerFn({ method: "GET" })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }): Promise<FcoItem[]> => {
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

export const upsertFco = createServerFn({ method: "POST" })
  .inputValidator((input: UpsertFcoInput) => input)
  .handler(async ({ data }): Promise<FcoItem> => {
    const payload = {
      projectId: data.projectId,
      fcoNumber: data.fcoNumber,
      title: data.title,
      description: data.description,
      status: data.status,
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
    const row = data.id
      ? await prisma.fieldChangeOrder.update({
          where: { id: data.id },
          data: payload,
          include: {
            linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
          },
        })
      : await prisma.fieldChangeOrder.create({
          data: payload,
          include: {
            linkedCvr: { select: { id: true, cvrNumber: true, title: true } },
          },
        });
    return toItem(row);
  });

export const deleteFco = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await prisma.fieldChangeOrder.delete({ where: { id: data.id } });
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

    const cvr = await prisma.changeLog.create({
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
      },
    });

    await prisma.fieldChangeOrder.update({
      where: { id: fco.id },
      data: { linkedCvrId: cvr.id, status: "LINKED_TO_CVR" },
    });

    return { cvrId: cvr.id };
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
