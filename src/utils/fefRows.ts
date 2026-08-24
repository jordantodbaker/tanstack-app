import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../server/db";
import { z } from "zod";
import type { FefRow } from "~/lib/types";
import {
  FEF_DATA_COLUMNS,
  FEF_ROW_STRING_FIELDS,
  fefRowHasUserData,
} from "~/lib/fef-helpers";
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
  /**
   * Confirms an empty `rows` really means "the user emptied this sheet".
   *
   * A save carrying no persistable rows deletes the whole (version, discipline,
   * section) — which is correct when someone deletes every row, and catastrophic
   * when a grid submits an empty sheet it never actually loaded. A client that
   * hasn't established what the server holds for a sheet must not send this, and
   * without it an empty save is refused rather than obeyed.
   */
  allowClear: z.boolean().optional(),
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

// ── FefRow write SQL, derived from the single source of truth ─────────────────
// A FefRow's DB data columns are `cbsCode` (stored from the client row `id`)
// plus every FEF_ROW_STRING_FIELDS entry. Building the INSERT column list, the
// per-row VALUES tuple, and the ON CONFLICT update list from that array (rather
// than hand-writing each column in raw SQL) means adding a FefRow field only
// requires updating the type + FEF_ROW_STRING_FIELDS — the SQL below follows
// automatically. Identifiers come from our own constants, never user input, so
// `Prisma.raw` interpolation here is injection-safe.
type FefDataColumn = (typeof FEF_DATA_COLUMNS)[number];

/** Full ordered INSERT column list: identity + data + timestamps. */
const FEF_INSERT_COLUMN_SQL = Prisma.raw(
  [
    "projectId",
    "versionId",
    "discipline",
    "section",
    "position",
    ...FEF_DATA_COLUMNS,
    "createdAt",
    "updatedAt",
  ]
    .map((c) => `"${c}"`)
    .join(", "),
);

/** `SET "col" = EXCLUDED."col"` for every data column + updatedAt. The identity
 *  columns are the conflict key and are never updated. */
const FEF_CONFLICT_UPDATE_SQL = Prisma.raw(
  [
    ...FEF_DATA_COLUMNS.map((c) => `"${c}" = EXCLUDED."${c}"`),
    `"updatedAt" = NOW()`,
  ].join(", "),
);

/** A row ready to write, keyed exactly like the INSERT column order. */
type FefWriteRow = {
  projectId: number;
  versionId: number;
  discipline: string;
  section: FefSectionKey;
  position: number;
} & Record<FefDataColumn, string>;

/** One `(…)` VALUES tuple in the exact order of FEF_INSERT_COLUMN_SQL. */
function fefValuesTuple(p: FefWriteRow): Prisma.Sql {
  return Prisma.sql`(${Prisma.join([
    Prisma.sql`${p.projectId}`,
    Prisma.sql`${p.versionId}`,
    Prisma.sql`${p.discipline}`,
    Prisma.sql`${p.section}::"FefSection"`,
    Prisma.sql`${p.position}`,
    ...FEF_DATA_COLUMNS.map((c) => Prisma.sql`${p[c]}`),
    Prisma.sql`NOW()`,
    Prisma.sql`NOW()`,
  ])})`;
}

// Read shape from `prisma.fefRow.findMany` that `toFefRow` consumes. Derived
// from the same field list so it stays in sync automatically.
type FefRowDb = {
  id: number;
  position: number;
} & Record<FefDataColumn, string>;

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

        // Diagnostic: three sheets of work have gone missing with the save
        // reporting success, so record what each request actually carried.
        logger.info("saveFefRows received", {
          versionId,
          discipline,
          section,
          receivedRows: rows.length,
          persistableRows: persistable.length,
          firstRowId: rows[0]?.id ?? null,
        });

        if (persistable.length === 0) {
          const existing = await prisma.fefRow.findMany({
            where: { versionId, discipline, section },
            orderBy: { position: "asc" },
          });
          // Deleting a populated sheet is only ever right when the client knew
          // what was there. Refuse otherwise and hand back what's on disk, so
          // the caller's cache re-syncs to reality instead of to its own blank.
          if (existing.length > 0 && !data.allowClear) {
            logger.error("saveFefRows refused an unconfirmed sheet wipe", {
              versionId,
              discipline,
              section,
              existingRows: existing.length,
            });
            return existing.map(toFefRow);
          }
          if (existing.length > 0) {
            logger.warn("saveFefRows clearing a sheet", {
              versionId,
              discipline,
              section,
              deletedRows: existing.length,
            });
          }
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
        const values = persistable.map(fefValuesTuple);

        const saved = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO "FefRow" (${FEF_INSERT_COLUMN_SQL})
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("versionId", "discipline", "section", "position")
            DO UPDATE SET ${FEF_CONFLICT_UPDATE_SQL}
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

        const values = rows.map((p, i) => {
          const { id, ...fields } = p;
          return fefValuesTuple({
            projectId,
            versionId,
            discipline,
            section: "TAKE_OFF",
            position: start + i,
            cbsCode: id.startsWith("__fe-blank-") ? "" : id,
            ...fields,
          });
        });

        await tx.$executeRaw(Prisma.sql`
            INSERT INTO "FefRow" (${FEF_INSERT_COLUMN_SQL})
            VALUES ${Prisma.join(values)}
          `);

        routed.push({ discipline, count: rows.length });
      }
    });

    return routed;
  });
