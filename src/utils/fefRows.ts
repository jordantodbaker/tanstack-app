import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import type { FefRow } from "~/lib/types";
import { fefRowHasUserData } from "~/lib/fef-helpers";
import { logger } from "~/lib/logger";

export type FefSectionKey = "TAKE_OFF" | "SUPPORT_LABOR" | "MATERIALS";

type FefRowDb = {
  id: number;
  cbsCode: string;
  name: string;
  description: string;
  shopField: string;
  weldGroupDescription: string;
  quantity: string;
  size: string;
  unit: string;
  metallurgyCode: string;
  boreSize: string;
  role: string;
  schedule: string;
  taskCode: string;
  laborHours: string;
  laborRate: string;
  materialCost: string;
  equipment: string;
  notes: string;
  sub: string;
  position: number;
};

const toFefRow = (r: FefRowDb): FefRow => {
  const { id, cbsCode, position: _position, ...fields } = r;
  return {
    ...fields,
    id: cbsCode === "" ? `__fe-blank-loaded-${id}` : cbsCode,
  };
};

export const fetchFefRows = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      projectId: number;
      discipline: string;
      section: FefSectionKey;
    }) => input,
  )
  .handler(async ({ data }) => {
    const rows = await prisma.fefRow.findMany({
      where: {
        projectId: data.projectId,
        discipline: data.discipline,
        section: data.section,
      },
      orderBy: { position: "asc" },
    });
    return rows.map(toFefRow);
  });

export const fefRowsQueryOptions = (input: {
  projectId: number | null;
  discipline: string;
  section: FefSectionKey;
}) =>
  queryOptions({
    queryKey: ["fefRows", input.projectId, input.discipline, input.section],
    queryFn: () =>
      input.projectId === null
        ? Promise.resolve([] as FefRow[])
        : fetchFefRows({
            data: {
              projectId: input.projectId,
              discipline: input.discipline,
              section: input.section,
            },
          }),
    enabled: input.projectId !== null,
  });

export const saveFefRows = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: number;
      discipline: string;
      section: FefSectionKey;
      rows: FefRow[];
    }) => input,
  )
  .handler(async ({ data }) => {
    const { projectId, discipline, section, rows } = data;
    try {
      const persistable = rows
        .filter((r) => !r.id.startsWith("__fe-blank-") || fefRowHasUserData(r))
        .map((r, i) => {
          const { id, ...fields } = r;
          return {
            projectId,
            discipline,
            section,
            position: i,
            cbsCode: id.startsWith("__fe-blank-") ? "" : id,
            ...fields,
          };
        });

      if (persistable.length === 0) {
        const current = await prisma.fefRow.findMany({
          where: { projectId, discipline, section },
          orderBy: { position: "asc" },
        });
        return current.map(toFefRow);
      }

      const saved = await prisma.$transaction(async (tx) => {
        await tx.fefRow.deleteMany({
          where: { projectId, discipline, section },
        });
        await tx.fefRow.createMany({ data: persistable });
        return tx.fefRow.findMany({
          where: { projectId, discipline, section },
          orderBy: { position: "asc" },
        });
      });

      return saved.map(toFefRow);
    } catch (err) {
      logger.error("saveFefRows failed", {
        projectId,
        discipline,
        section,
        rowCount: rows.length,
        err,
      });
      throw err;
    }
  });
