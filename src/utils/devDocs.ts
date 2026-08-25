import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { requireVersionAccess } from "./users.server";
import { VersionId, parseIdScalar } from "~/lib/validators";

export type DevDocChecklist = {
  checkedKeys: string[];
  escalationNotes: string;
  contingencyNotes: string;
};

const SaveDevDocChecklistSchema = z.object({
  versionId: VersionId,
  checkedKeys: z.array(z.string()),
  escalationNotes: z.string(),
  contingencyNotes: z.string(),
});

const EMPTY: DevDocChecklist = {
  checkedKeys: [],
  escalationNotes: "",
  contingencyNotes: "",
};

export const fetchDevDocChecklist = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data }): Promise<DevDocChecklist> => {
    await requireVersionAccess(data);
    const row = await prisma.developmentDocChecklist.findUnique({
      where: { versionId: data },
      select: {
        checkedKeys: true,
        escalationNotes: true,
        contingencyNotes: true,
      },
    });
    return row ?? EMPTY;
  });

export const devDocChecklistQueryOptions = (versionId: number | null) =>
  queryOptions({
    queryKey: qk.devDocChecklist(versionId),
    queryFn: () =>
      versionId === null
        ? Promise.resolve(EMPTY)
        : fetchDevDocChecklist({ data: versionId }),
    enabled: versionId !== null,
  });

export const saveDevDocChecklist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveDevDocChecklistSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { versionId, checkedKeys, escalationNotes, contingencyNotes } = data;
    await requireVersionAccess(versionId);
    await prisma.developmentDocChecklist.upsert({
      where: { versionId },
      create: { versionId, checkedKeys, escalationNotes, contingencyNotes },
      update: { checkedKeys, escalationNotes, contingencyNotes },
    });
    return { ok: true };
  });
