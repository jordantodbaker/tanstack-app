import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import type { FefRow } from "~/lib/types";

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
  position: number;
};

const toFefRow = (r: FefRowDb): FefRow => ({
  id: r.cbsCode === "" ? `__fe-blank-loaded-${r.id}` : r.cbsCode,
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

const hasUserData = (r: FefRow): boolean =>
  r.name !== "" ||
  r.description !== "" ||
  r.shopField !== "" ||
  r.weldGroupDescription !== "" ||
  r.quantity !== "" ||
  r.size !== "" ||
  r.unit !== "" ||
  r.metallurgyCode !== "" ||
  r.boreSize !== "" ||
  r.role !== "" ||
  r.schedule !== "" ||
  r.taskCode !== "" ||
  r.laborHours !== "" ||
  r.laborRate !== "" ||
  r.materialCost !== "" ||
  r.equipment !== "" ||
  r.notes !== "";

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
      .filter((r) => !r.id.startsWith("__fe-blank-") || hasUserData(r))
      .map((r, i) => ({
        projectId,
        discipline,
        section,
        position: i,
        cbsCode: r.id.startsWith("__fe-blank-") ? "" : r.id,
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
  });
