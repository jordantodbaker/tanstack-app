import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { requireProjectAccess } from "./users.server";
import { ProjectId, parseProjectIdInput } from "~/lib/validators";

const BasisMilestoneSchema = z.object({
  event: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});
const BasisInputsPayloadSchema = z.object({
  estimateFactor: z.string(),
  compositeLaborRate: z.string(),
  milestones: z.array(BasisMilestoneSchema),
});
const SaveBasisInputsSchema = z.object({
  projectId: ProjectId,
  payload: BasisInputsPayloadSchema,
});

export type BasisMilestone = {
  event: string;
  startDate: string;
  endDate: string;
};

export type BasisInputsPayload = {
  estimateFactor: string;
  compositeLaborRate: string;
  milestones: BasisMilestone[];
};

const EMPTY: BasisInputsPayload = {
  estimateFactor: "",
  compositeLaborRate: "",
  milestones: [],
};

export const fetchBasisInputs = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data }) => {
    await requireProjectAccess(data);
    const row = await prisma.basisInputs.findUnique({
      where: { projectId: data },
    });
    if (!row) return EMPTY;
    return {
      estimateFactor: row.estimateFactor,
      compositeLaborRate: row.compositeLaborRate,
      milestones: (row.milestones as BasisMilestone[]) ?? [],
    } satisfies BasisInputsPayload;
  });

export const basisInputsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["basisInputs", projectId],
    queryFn: () =>
      projectId === null
        ? Promise.resolve(EMPTY)
        : fetchBasisInputs({ data: projectId }),
    enabled: projectId !== null,
  });

export const saveBasisInputs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveBasisInputsSchema.parse(input))
  .handler(async ({ data }) => {
    const { projectId, payload } = data;
    await requireProjectAccess(projectId);
    await prisma.basisInputs.upsert({
      where: { projectId },
      create: {
        projectId,
        estimateFactor: payload.estimateFactor,
        compositeLaborRate: payload.compositeLaborRate,
        milestones: payload.milestones,
      },
      update: {
        estimateFactor: payload.estimateFactor,
        compositeLaborRate: payload.compositeLaborRate,
        milestones: payload.milestones,
      },
    });
    return { ok: true };
  });
