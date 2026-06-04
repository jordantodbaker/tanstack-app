import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../server/db";
import { z } from "zod";
import type { FefRow } from "~/lib/types";
import { FEF_ROW_STRING_FIELDS, fefRowHasUserData } from "~/lib/fef-helpers";
import { projectScopedHandler } from "./users.server";
import { logger } from "~/lib/logger";
import { ProjectId } from "~/lib/validators";

const FefSectionSchema = z.enum(["TAKE_OFF", "SUPPORT_LABOR", "MATERIALS"]);

const FefRowsInputSchema = z.object({
  projectId: ProjectId,
  discipline: z.string().min(1),
  section: FefSectionSchema,
});

// Build a row schema from the same field list the rest of the code uses, so
// a new FefRow field automatically extends validation. `id` is the synthetic
// client id (may include the "__fe-blank-…" sentinel) or a real CBS code.
// Cast via unknown: the dynamically-built shape is provably `Record<string,
// string>` to TS but matches the FefRow shape at runtime (FEF_ROW_STRING_FIELDS
// IS the FefRow key set minus `id`).
const FefRowSchema = z.object(
  Object.fromEntries([
    ["id", z.string()],
    ...FEF_ROW_STRING_FIELDS.map((f) => [f, z.string()] as const),
  ]),
) as unknown as z.ZodType<FefRow>;

const SaveFefRowsSchema = z.object({
  projectId: ProjectId,
  discipline: z.string().min(1),
  section: FefSectionSchema,
  rows: z.array(FefRowSchema),
});

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
  crewMixId: string;
  schedule: string;
  taskCode: string;
  laborHours: string;
  laborFactor: string;
  laborRate: string;
  materialCost: string;
  equipment: string;
  notes: string;
  sub: string;
  area: string;
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
  .inputValidator((input: unknown) => FefRowsInputSchema.parse(input))
  .handler(
    projectScopedHandler(async ({ data }) => {
      const rows = await prisma.fefRow.findMany({
        where: {
          projectId: data.projectId,
          discipline: data.discipline,
          section: data.section,
        },
        orderBy: { position: "asc" },
      });
      return rows.map(toFefRow);
    }),
  );

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
  .inputValidator((input: unknown) => SaveFefRowsSchema.parse(input))
  .handler(
    projectScopedHandler(async ({ data }) => {
      const { projectId, discipline, section, rows } = data;
      try {
        const persistable = rows
          .filter(
            (r) => !r.id.startsWith("__fe-blank-") || fefRowHasUserData(r),
          )
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
          // No persistable rows from the client. Wipe any existing rows for
          // this (project, discipline, section) and bail.
          await prisma.fefRow.deleteMany({
            where: { projectId, discipline, section },
          });
          return [];
        }

        // Single round-trip upsert keyed by the (projectId, discipline,
        // section, position) unique index, plus a trailing DELETE for any
        // positions that no longer exist. Replaces the previous wipe-and-
        // recreate which churned every row's primary key on every keystroke
        // (the agentid stability is what keeps React keys stable during edits
        // and keeps the response payload addressable).
        const values = persistable.map(
          (p) => Prisma.sql`(
            ${p.projectId}, ${p.discipline}, ${p.section}::"FefSection", ${p.position},
            ${p.cbsCode}, ${p.name}, ${p.description}, ${p.shopField}, ${p.weldGroupDescription},
            ${p.quantity}, ${p.size}, ${p.unit}, ${p.metallurgyCode}, ${p.boreSize},
            ${p.role}, ${p.crewMixId}, ${p.schedule}, ${p.taskCode}, ${p.laborHours}, ${p.laborFactor}, ${p.laborRate},
            ${p.materialCost}, ${p.equipment}, ${p.notes}, ${p.sub}, ${p.area},
            NOW(), NOW()
          )`,
        );

        const saved = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO "FefRow" (
              "projectId", "discipline", "section", "position",
              "cbsCode", "name", "description", "shopField", "weldGroupDescription",
              "quantity", "size", "unit", "metallurgyCode", "boreSize",
              "role", "crewMixId", "schedule", "taskCode", "laborHours", "laborFactor", "laborRate",
              "materialCost", "equipment", "notes", "sub", "area",
              "createdAt", "updatedAt"
            )
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("projectId", "discipline", "section", "position")
            DO UPDATE SET
              "cbsCode" = EXCLUDED."cbsCode",
              "name" = EXCLUDED."name",
              "description" = EXCLUDED."description",
              "shopField" = EXCLUDED."shopField",
              "weldGroupDescription" = EXCLUDED."weldGroupDescription",
              "quantity" = EXCLUDED."quantity",
              "size" = EXCLUDED."size",
              "unit" = EXCLUDED."unit",
              "metallurgyCode" = EXCLUDED."metallurgyCode",
              "boreSize" = EXCLUDED."boreSize",
              "role" = EXCLUDED."role",
              "crewMixId" = EXCLUDED."crewMixId",
              "schedule" = EXCLUDED."schedule",
              "taskCode" = EXCLUDED."taskCode",
              "laborHours" = EXCLUDED."laborHours",
              "laborFactor" = EXCLUDED."laborFactor",
              "laborRate" = EXCLUDED."laborRate",
              "materialCost" = EXCLUDED."materialCost",
              "equipment" = EXCLUDED."equipment",
              "notes" = EXCLUDED."notes",
              "sub" = EXCLUDED."sub",
              "area" = EXCLUDED."area",
              "updatedAt" = NOW()
          `;
          await tx.$executeRaw`
            DELETE FROM "FefRow"
            WHERE "projectId" = ${projectId}
              AND "discipline" = ${discipline}
              AND "section" = ${section}::"FefSection"
              AND "position" >= ${persistable.length}
          `;
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
    }),
  );
