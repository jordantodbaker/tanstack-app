import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../server/db";
import { z } from "zod";
import type { FefRow } from "~/lib/types";
import { FEF_ROW_STRING_FIELDS, fefRowHasUserData } from "~/lib/fef-helpers";
import { requireVersionAccess, versionScopedHandler } from "./users.server";
import { logger } from "~/lib/logger";
import { VersionId } from "~/lib/validators";

const FefSectionSchema = z.enum(["TAKE_OFF", "SUPPORT_LABOR", "MATERIALS"]);

const FefRowsInputSchema = z.object({
  versionId: VersionId,
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
  versionId: VersionId,
  discipline: z.string().min(1),
  section: FefSectionSchema,
  rows: z.array(FefRowSchema),
});

const AppendTakeOffSchema = z.object({
  versionId: VersionId,
  groups: z.array(
    z.object({
      discipline: z.string().min(1),
      rows: z.array(FefRowSchema),
    }),
  ),
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
    versionScopedHandler(async ({ data }) => {
      const rows = await prisma.fefRow.findMany({
        where: {
          versionId: data.versionId,
          discipline: data.discipline,
          section: data.section,
        },
        orderBy: { position: "asc" },
      });
      return rows.map(toFefRow);
    }),
  );

export const fefRowsQueryOptions = (input: {
  versionId: number | null;
  discipline: string;
  section: FefSectionKey;
}) =>
  queryOptions({
    queryKey: ["fefRows", input.versionId, input.discipline, input.section],
    queryFn: () =>
      input.versionId === null
        ? Promise.resolve([] as FefRow[])
        : fetchFefRows({
            data: {
              versionId: input.versionId,
              discipline: input.discipline,
              section: input.section,
            },
          }),
    enabled: input.versionId !== null,
  });

export const saveFefRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveFefRowsSchema.parse(input))
  .handler(async ({ data }) => {
    // Access + the version's owning projectId in one round-trip. FefRow keeps a
    // denormalized projectId column (NOT NULL), so writes need it.
    const { projectId } = await requireVersionAccess(data.versionId);
    {
      const { versionId, discipline, section, rows } = data;
      try {
        const persistable = rows
          .filter(
            (r) => !r.id.startsWith("__fe-blank-") || fefRowHasUserData(r),
          )
          .map((r, i) => {
            const { id, ...fields } = r;
            return {
              projectId,
              versionId,
              discipline,
              section,
              position: i,
              cbsCode: id.startsWith("__fe-blank-") ? "" : id,
              ...fields,
            };
          });

        if (persistable.length === 0) {
          // No persistable rows from the client. Wipe any existing rows for
          // this (version, discipline, section) and bail.
          await prisma.fefRow.deleteMany({
            where: { versionId, discipline, section },
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
            ${p.projectId}, ${p.versionId}, ${p.discipline}, ${p.section}::"FefSection", ${p.position},
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
              "projectId", "versionId", "discipline", "section", "position",
              "cbsCode", "name", "description", "shopField", "weldGroupDescription",
              "quantity", "size", "unit", "metallurgyCode", "boreSize",
              "role", "crewMixId", "schedule", "taskCode", "laborHours", "laborFactor", "laborRate",
              "materialCost", "equipment", "notes", "sub", "area",
              "createdAt", "updatedAt"
            )
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("versionId", "discipline", "section", "position")
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
            WHERE "versionId" = ${versionId}
              AND "discipline" = ${discipline}
              AND "section" = ${section}::"FefSection"
              AND "position" >= ${persistable.length}
          `;
          return tx.fefRow.findMany({
            where: { versionId, discipline, section },
            orderBy: { position: "asc" },
          });
        });

        return saved.map(toFefRow);
      } catch (err) {
        logger.error("saveFefRows failed", {
          projectId,
          versionId,
          discipline,
          section,
          rowCount: rows.length,
          err,
        });
        throw err;
      }
    }
  });

/**
 * Append rows to the END of one or more disciplines' TAKE_OFF sheets, without
 * touching what's already there. Used by Excel paste to route "off-discipline"
 * codes to their own discipline's Take Off (that page isn't open, so an
 * append-only insert is race-free and avoids a fetch-merge round-trip). Returns
 * how many rows landed on each discipline. Only rows with a real CBS code or
 * user data are kept — blank template rows are dropped.
 */
export const appendTakeOffRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AppendTakeOffSchema.parse(input))
  .handler(async ({ data }) => {
    const { projectId } = await requireVersionAccess(data.versionId);
    const { versionId, groups } = data;
    const routed: { discipline: string; count: number }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const group of groups) {
        const { discipline } = group;
        const rows = group.rows.filter(
          (r) =>
            (!r.id.startsWith("__fe-blank-") && r.id !== "") ||
            fefRowHasUserData(r),
        );
        if (rows.length === 0) continue;

        // Positions are contiguous 0..count-1 (saveFefRows keeps them so), so
        // the next free position is the current row count.
        const start = await tx.fefRow.count({
          where: { versionId, discipline, section: "TAKE_OFF" },
        });

        const values = rows.map(
          (p, i) => Prisma.sql`(
              ${projectId}, ${versionId}, ${discipline}, 'TAKE_OFF'::"FefSection", ${start + i},
              ${p.id.startsWith("__fe-blank-") ? "" : p.id}, ${p.name}, ${p.description}, ${p.shopField}, ${p.weldGroupDescription},
              ${p.quantity}, ${p.size}, ${p.unit}, ${p.metallurgyCode}, ${p.boreSize},
              ${p.role}, ${p.crewMixId}, ${p.schedule}, ${p.taskCode}, ${p.laborHours}, ${p.laborFactor}, ${p.laborRate},
              ${p.materialCost}, ${p.equipment}, ${p.notes}, ${p.sub}, ${p.area},
              NOW(), NOW()
            )`,
        );

        await tx.$executeRaw(Prisma.sql`
            INSERT INTO "FefRow" (
              "projectId", "versionId", "discipline", "section", "position",
              "cbsCode", "name", "description", "shopField", "weldGroupDescription",
              "quantity", "size", "unit", "metallurgyCode", "boreSize",
              "role", "crewMixId", "schedule", "taskCode", "laborHours", "laborFactor", "laborRate",
              "materialCost", "equipment", "notes", "sub", "area",
              "createdAt", "updatedAt"
            )
            VALUES ${Prisma.join(values)}
          `);

        routed.push({ discipline, count: rows.length });
      }
    });

    return routed;
  });
