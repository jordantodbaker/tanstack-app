import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { requireVersionAccess } from "./users.server";
import { VersionId, parseIdScalar } from "~/lib/validators";

const BasisMilestoneSchema = z.object({
  event: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});
const BasisManpowerSchema = z.object({
  discipline: z.string(),
  durationWeeks: z.string(),
  avgHeadcount: z.string(),
});
const BasisInputsPayloadSchema = z.object({
  estimateFactor: z.string(),
  compositeLaborRate: z.string(),
  milestones: z.array(BasisMilestoneSchema),
  manpower: z.array(BasisManpowerSchema),
});
const SaveBasisInputsSchema = z.object({
  versionId: VersionId,
  payload: BasisInputsPayloadSchema,
});

export type BasisMilestone = {
  event: string;
  startDate: string;
  endDate: string;
};

/** One row of the Manpower table. `discipline` is a discipline id. */
export type BasisManpower = {
  discipline: string;
  durationWeeks: string;
  avgHeadcount: string;
};

export type BasisInputsPayload = {
  estimateFactor: string;
  compositeLaborRate: string;
  milestones: BasisMilestone[];
  manpower: BasisManpower[];
};

const EMPTY: BasisInputsPayload = {
  estimateFactor: "",
  compositeLaborRate: "",
  milestones: [],
  manpower: [],
};

export const fetchBasisInputs = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data }) => {
    await requireVersionAccess(data);
    const row = await prisma.basisInputs.findUnique({
      where: { versionId: data },
    });
    if (!row) return EMPTY;
    return {
      estimateFactor: row.estimateFactor,
      compositeLaborRate: row.compositeLaborRate,
      milestones: (row.milestones as BasisMilestone[]) ?? [],
      manpower: (row.manpower as BasisManpower[]) ?? [],
    } satisfies BasisInputsPayload;
  });

export const basisInputsQueryOptions = (versionId: number | null) =>
  queryOptions({
    queryKey: qk.basisInputs.forVersion(versionId),
    queryFn: () =>
      versionId === null
        ? Promise.resolve(EMPTY)
        : fetchBasisInputs({ data: versionId }),
    enabled: versionId !== null,
  });

export const saveBasisInputs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveBasisInputsSchema.parse(input))
  .handler(async ({ data }) => {
    const { versionId, payload } = data;
    await requireVersionAccess(versionId);
    await prisma.basisInputs.upsert({
      where: { versionId },
      create: {
        versionId,
        estimateFactor: payload.estimateFactor,
        compositeLaborRate: payload.compositeLaborRate,
        milestones: payload.milestones,
        manpower: payload.manpower,
      },
      update: {
        estimateFactor: payload.estimateFactor,
        compositeLaborRate: payload.compositeLaborRate,
        milestones: payload.milestones,
        manpower: payload.manpower,
      },
    });
    return { ok: true };
  });
