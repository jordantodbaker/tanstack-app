import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import type { FefRow } from "~/lib/types";

export type FefSectionKey = "TAKE_OFF" | "SUPPORT_LABOR" | "MATERIALS";

type FefRowDb = {
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
  position: number;
};

const toFefRow = (r: FefRowDb): FefRow => ({
  id: r.cbsCode,
  name: r.name,
  description: r.description,
  shopField: r.shopField,
  weldGroupDescription: r.weldGroupDescription,
  quantity: r.quantity,
  size: r.size,
  unit: r.unit,
  metallurgyCode: r.metallurgyCode,
  boreSize: r.boreSize,
  role: r.role,
  schedule: r.schedule,
  taskCode: r.taskCode,
  laborHours: r.laborHours,
  laborRate: r.laborRate,
  materialCost: r.materialCost,
  equipment: r.equipment,
  notes: r.notes,
});

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
    const persistable = rows
      .filter((r) => !r.id.startsWith("__fe-blank-"))
      .map((r, i) => ({
        projectId,
        discipline,
        section,
        position: i,
        cbsCode: r.id,
        name: r.name,
        description: r.description,
        shopField: r.shopField,
        weldGroupDescription: r.weldGroupDescription,
        quantity: r.quantity,
        size: r.size,
        unit: r.unit,
        metallurgyCode: r.metallurgyCode,
        boreSize: r.boreSize,
        role: r.role,
        schedule: r.schedule,
        taskCode: r.taskCode,
        laborHours: r.laborHours,
        laborRate: r.laborRate,
        materialCost: r.materialCost,
        equipment: r.equipment,
        notes: r.notes,
      }));

    await prisma.$transaction([
      prisma.fefRow.deleteMany({
        where: { projectId, discipline, section },
      }),
      ...(persistable.length > 0
        ? [prisma.fefRow.createMany({ data: persistable })]
        : []),
    ]);

    return { saved: persistable.length };
  });
