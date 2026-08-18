import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { requireVersionAccess } from "./users.server";
import { VersionId, parseIdScalar } from "~/lib/validators";

const SaveDevDocChecklistSchema = z.object({
  versionId: VersionId,
  checkedKeys: z.array(z.string()),
});

const EMPTY: { checkedKeys: string[] } = { checkedKeys: [] };

export const fetchDevDocChecklist = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data }): Promise<{ checkedKeys: string[] }> => {
    await requireVersionAccess(data);
    const row = await prisma.developmentDocChecklist.findUnique({
      where: { versionId: data },
      select: { checkedKeys: true },
    });
    return row ?? EMPTY;
  });

export const devDocChecklistQueryOptions = (versionId: number | null) =>
  queryOptions({
    queryKey: ["devDocChecklist", versionId],
    queryFn: () =>
      versionId === null
        ? Promise.resolve(EMPTY)
        : fetchDevDocChecklist({ data: versionId }),
    enabled: versionId !== null,
  });

export const saveDevDocChecklist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveDevDocChecklistSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { versionId, checkedKeys } = data;
    await requireVersionAccess(versionId);
    await prisma.developmentDocChecklist.upsert({
      where: { versionId },
      create: { versionId, checkedKeys },
      update: { checkedKeys },
    });
    return { ok: true };
  });
