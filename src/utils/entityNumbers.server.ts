import type { Prisma } from "../generated/prisma/client";

/**
 * SERVER-ONLY. Atomic allocation of per-project, per-entity record numbers
 * (CVR-0001, FCO-0001, …). Backed by the `NumberSequence` table — see the
 * model comment in schema.prisma for the concurrency rationale.
 *
 * Callers pass the transaction client from the same `prisma.$transaction` that
 * creates the record, so the increment and the create commit (or roll back)
 * together and no number is ever burned by a failed create.
 */

/** Entity types that get an auto-generated, per-project sequential number. The
 *  string matches the `entityType` discriminator used by the audit log. */
export type NumberedEntityType =
  | "ChangeLog"
  | "FieldChangeOrder"
  | "Rfi"
  | "Pco"
  | "Trend";

/**
 * Default prefix + zero-pad width per entity, used to seed a project's
 * `NumberSequence` row the first time a number is allocated. The row is
 * editable afterward, so changing a project's format doesn't need a code
 * change — allocation always formats from the row's stored prefix/padWidth.
 *
 * These match the convention already in the data and the dialog placeholders
 * (CVR-001, FCO-001, RFI-001, PCO-001, TR-001) — 3-digit pad, "TR-" for trends
 * — so auto-assigned numbers continue the existing series rather than switching
 * format.
 */
export const NUMBER_DEFAULTS: Record<
  NumberedEntityType,
  { prefix: string; padWidth: number }
> = {
  ChangeLog: { prefix: "CVR-", padWidth: 3 },
  FieldChangeOrder: { prefix: "FCO-", padWidth: 3 },
  Rfi: { prefix: "RFI-", padWidth: 3 },
  Pco: { prefix: "PCO-", padWidth: 3 },
  Trend: { prefix: "TR-", padWidth: 3 },
};

/** `${prefix}${value zero-padded to padWidth}` — e.g. ("CVR-", 7, 4) → "CVR-0007". */
export function formatEntityNumber(
  prefix: string,
  value: number,
  padWidth: number,
): string {
  return `${prefix}${String(value).padStart(padWidth, "0")}`;
}

/**
 * Allocate and return the next record number for `entityType` within
 * `projectId`. Must be called inside an interactive transaction (`tx`).
 *
 * The single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` is what makes
 * this race-free: the first allocation inserts the row at `lastValue = 1`;
 * every later one takes the conflict branch and increments atomically, so two
 * concurrent creates can't read the same value. Column identifiers are
 * double-quoted because Prisma maps the model/fields to PascalCase/camelCase
 * table and column names (no snake_case mapping in this schema).
 */
export async function allocateEntityNumber(
  tx: Prisma.TransactionClient,
  projectId: number,
  entityType: NumberedEntityType,
): Promise<string> {
  const { prefix, padWidth } = NUMBER_DEFAULTS[entityType];
  const rows = await tx.$queryRaw<
    { lastValue: number; prefix: string; padWidth: number }[]
  >`
    INSERT INTO "NumberSequence" ("projectId", "entityType", "prefix", "padWidth", "lastValue", "updatedAt")
    VALUES (${projectId}, ${entityType}, ${prefix}, ${padWidth}, 1, now())
    ON CONFLICT ("projectId", "entityType")
    DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1, "updatedAt" = now()
    RETURNING "lastValue", "prefix", "padWidth"
  `;
  const row = rows[0];
  return formatEntityNumber(row.prefix, row.lastValue, row.padWidth);
}

/**
 * Keep a user-supplied number (manual override / legacy import) when present,
 * otherwise auto-assign the next one from the project sequence. The shared
 * "blank → allocate" rule every create path uses.
 */
export async function allocateIfBlank(
  tx: Prisma.TransactionClient,
  projectId: number,
  entityType: NumberedEntityType,
  provided: string,
): Promise<string> {
  return provided.trim()
    ? provided
    : allocateEntityNumber(tx, projectId, entityType);
}
