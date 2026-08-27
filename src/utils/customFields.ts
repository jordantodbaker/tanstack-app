import { createServerFn } from "@tanstack/react-start";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import { Id, ProjectId } from "~/lib/validators";
import { hasAtLeastRole, type CurrentUser } from "./users";
import { requireProjectAccess } from "./users.server";
import { recordCreate, recordDelete, recordUpdate } from "./audit.server";
import {
  CUSTOM_FIELD_LABEL_MAX,
  assignPositions,
  nextFreeSlot,
  nextPosition,
  normalizeLabel,
} from "~/lib/custom-fields";
import {
  CUSTOM_FIELD_SLOT_COUNT,
  customFieldForSlot,
} from "~/lib/fef-helpers";

/**
 * User-defined take-off columns: the definitions, not the data.
 *
 * A definition gives one of `FefRow`'s fixed `customN` slots a user-facing
 * name, scoped to a project + discipline. The values live in the row column, so
 * renaming a definition never rewrites a single line item.
 *
 * The slot IS the storage, which drives the two least obvious rules here:
 *
 *  - Adding CLEARS the slot it allocates. Removing a definition leaves its
 *    values in place (harmless — nothing renders them), but that means a
 *    recycled slot still holds the previous column's data. Without the clear,
 *    adding "Heat Number" into the slot "Client Tag" used to occupy would show
 *    CT-4471 down the new column.
 *  - Removing does NOT touch row data, so it stays cheap and reversible up
 *    until the slot is handed to a new column.
 */

const DisciplineScope = z.object({
  projectId: ProjectId,
  discipline: z.string().min(1),
});
const AddInput = DisciplineScope.extend({
  label: z.string().min(1).max(200),
});
const RenameInput = z.object({
  id: Id,
  label: z.string().min(1).max(200),
});
const IdOnly = z.object({ id: Id });
/** Undo of a remove: the definition's original slot and position, restored. */
const RestoreInput = DisciplineScope.extend({
  label: z.string().min(1).max(200),
  slot: z.int().min(1).max(CUSTOM_FIELD_SLOT_COUNT),
  position: z.int().nonnegative(),
});
const ReorderInput = DisciplineScope.extend({
  orderedIds: z.array(Id),
});

export type CustomFieldDefItem = {
  id: number;
  discipline: string;
  /** 1-based; maps to `FefRow.custom{slot}`. */
  slot: number;
  /** The `customN` field the grid reads and writes for this column. */
  field: string;
  label: string;
  position: number;
};

type DefRow = {
  id: number;
  discipline: string;
  slot: number;
  label: string;
  position: number;
};

const toItem = (d: DefRow): CustomFieldDefItem => ({
  id: d.id,
  discipline: d.discipline,
  slot: d.slot,
  // Resolved server-side so no caller has to know the slot→field convention.
  field: customFieldForSlot(d.slot) ?? "",
  label: d.label,
  position: d.position,
});

const DEF_SELECT = {
  id: true,
  discipline: true,
  slot: true,
  label: true,
  position: true,
} as const;

const byDisplayOrder = [{ position: "asc" }, { id: "asc" }] as const;

/** Defining columns changes the sheet for everyone on the project. */
function assertMayDefine(actor: CurrentUser): void {
  if (!hasAtLeastRole(actor.role, "APPROVER")) {
    throw new Error(
      "Forbidden: adding or removing take-off columns requires APPROVER privilege",
    );
  }
}

/** Reads the definition, then authorizes against ITS project — never a
 *  project id supplied alongside the id. */
async function requireDefAccess(id: number) {
  const def = await prisma.customFieldDef.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      projectId: true,
      discipline: true,
      slot: true,
      label: true,
      position: true,
    },
  });
  const actor = await requireProjectAccess(def.projectId);
  assertMayDefine(actor);
  return { def, actor };
}

export const fetchCustomFieldDefs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => DisciplineScope.parse(input))
  .handler(async ({ data }): Promise<CustomFieldDefItem[]> => {
    await requireProjectAccess(data.projectId);
    const rows = await prisma.customFieldDef.findMany({
      where: { projectId: data.projectId, discipline: data.discipline },
      orderBy: [...byDisplayOrder],
      select: DEF_SELECT,
    });
    return rows.map(toItem);
  });

export const customFieldDefsQueryOptions = (
  projectId: number | null,
  discipline: string,
) =>
  queryOptions({
    queryKey: qk.customFieldDefs(projectId, discipline),
    queryFn: (): Promise<CustomFieldDefItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchCustomFieldDefs({ data: { projectId, discipline } }),
    enabled: projectId !== null,
    // Definitions change rarely and every mutation below invalidates them.
    staleTime: Infinity,
  });

/**
 * Add a column, allocating the lowest free slot.
 *
 * Clears that slot across the project's rows for this discipline first — see
 * the module note. The clear and the create share a transaction so a failure
 * can't leave a slot wiped with no column to show for it.
 */
export const addCustomFieldDef = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AddInput.parse(input))
  .handler(async ({ data }): Promise<CustomFieldDefItem> => {
    const actor = await requireProjectAccess(data.projectId);
    assertMayDefine(actor);

    const label = normalizeLabel(data.label);
    if (label === null) throw new Error("Give the column a name.");

    return prisma.$transaction(async (tx) => {
      const existing = await tx.customFieldDef.findMany({
        where: { projectId: data.projectId, discipline: data.discipline },
        select: { slot: true, position: true },
      });
      const slot = nextFreeSlot(existing.map((d) => d.slot));
      if (slot === undefined) {
        throw new Error(
          `This discipline already has the maximum of ${CUSTOM_FIELD_SLOT_COUNT} custom columns. Remove one to add another.`,
        );
      }
      const field = customFieldForSlot(slot);
      if (!field) throw new Error(`No storage column for slot ${slot}.`);

      // Start the column empty even when its slot previously held another
      // column's values.
      await tx.fefRow.updateMany({
        where: { projectId: data.projectId, discipline: data.discipline },
        data: { [field]: "" },
      });

      const created = await tx.customFieldDef.create({
        data: {
          projectId: data.projectId,
          discipline: data.discipline,
          slot,
          label,
          position: nextPosition(existing.map((d) => d.position)),
        },
        select: DEF_SELECT,
      });
      await recordCreate(tx, {
        entityType: "CustomFieldDef",
        entityId: created.id,
        projectId: data.projectId,
        actor,
      });
      return toItem(created);
    });
  });

/** Rename a column. Touches the label only — no row is rewritten. */
export const renameCustomFieldDef = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RenameInput.parse(input))
  .handler(async ({ data }): Promise<CustomFieldDefItem> => {
    const { def, actor } = await requireDefAccess(data.id);
    const label = normalizeLabel(data.label);
    if (label === null) throw new Error("Give the column a name.");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.customFieldDef.update({
        where: { id: data.id },
        data: { label },
        select: DEF_SELECT,
      });
      await recordUpdate(
        tx,
        {
          entityType: "CustomFieldDef",
          entityId: data.id,
          projectId: def.projectId,
          actor,
        },
        [{ field: "label", oldValue: def.label, newValue: label }],
      );
      return row;
    });
    return toItem(updated);
  });

/**
 * Remove a column from the sheet.
 *
 * Deletes the definition and leaves the row values alone: nothing renders them
 * once the column is gone, and keeping them means an accidental removal costs
 * nothing until the slot is reallocated. `addCustomFieldDef` is what clears a
 * recycled slot.
 */
/** What an undo needs to put the column back exactly where it was. */
export type RemovedCustomField = {
  projectId: number;
  discipline: string;
  label: string;
  slot: number;
  position: number;
};

export const removeCustomFieldDef = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdOnly.parse(input))
  .handler(async ({ data }): Promise<RemovedCustomField> => {
    const { def, actor } = await requireDefAccess(data.id);
    await prisma.$transaction(async (tx) => {
      await tx.customFieldDef.delete({ where: { id: data.id } });
      await recordDelete(tx, {
        entityType: "CustomFieldDef",
        entityId: data.id,
        projectId: def.projectId,
        actor,
      });
    });
    // Returned rather than discarded so the caller can offer an undo. Row data
    // is untouched by the delete, so restoring the definition at this slot
    // brings the values back with it.
    return {
      projectId: def.projectId,
      discipline: def.discipline,
      label: def.label,
      slot: def.slot,
      position: def.position,
    };
  });

/**
 * Put a just-removed column back, values and all.
 *
 * NOT `addCustomFieldDef`: that allocates the lowest free slot and CLEARS it,
 * which for an undo is exactly backwards — it would hand the column a
 * different slot and wipe the data the undo exists to recover. This restores
 * the original slot and position and writes no row.
 *
 * Refuses when the slot has been taken since. That is the one case where the
 * values really are gone: whoever claimed the slot cleared it on the way in,
 * so silently restoring here would produce a column that looks recovered and
 * is empty.
 */
export const restoreCustomFieldDef = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RestoreInput.parse(input))
  .handler(async ({ data }): Promise<CustomFieldDefItem> => {
    const actor = await requireProjectAccess(data.projectId);
    assertMayDefine(actor);

    const label = normalizeLabel(data.label);
    if (label === null) throw new Error("Give the column a name.");

    return prisma.$transaction(async (tx) => {
      const taken = await tx.customFieldDef.findFirst({
        where: {
          projectId: data.projectId,
          discipline: data.discipline,
          slot: data.slot,
        },
        select: { label: true },
      });
      if (taken) {
        throw new Error(
          `That column's slot now belongs to “${taken.label}”, which cleared it. ` +
            `Add “${label}” again to get the column back — it will start empty.`,
        );
      }

      const restored = await tx.customFieldDef.create({
        data: {
          projectId: data.projectId,
          discipline: data.discipline,
          slot: data.slot,
          label,
          position: data.position,
        },
        select: DEF_SELECT,
      });
      await recordCreate(tx, {
        entityType: "CustomFieldDef",
        entityId: restored.id,
        projectId: data.projectId,
        actor,
      });
      return toItem(restored);
    });
  });

/** Left-to-right order of a discipline's custom columns. */
export const reorderCustomFieldDefs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReorderInput.parse(input))
  .handler(async ({ data }): Promise<CustomFieldDefItem[]> => {
    const actor = await requireProjectAccess(data.projectId);
    assertMayDefine(actor);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.customFieldDef.findMany({
        where: { projectId: data.projectId, discipline: data.discipline },
        select: { id: true },
      });
      const writes = assignPositions(
        data.orderedIds,
        existing.map((d) => d.id),
      );
      for (const w of writes) {
        await tx.customFieldDef.update({
          where: { id: w.id },
          data: { position: w.position },
        });
      }
      const rows = await tx.customFieldDef.findMany({
        where: { projectId: data.projectId, discipline: data.discipline },
        orderBy: [...byDisplayOrder],
        select: DEF_SELECT,
      });
      return rows.map(toItem);
    });
  });

/**
 * Permanently clear a column's data without removing the column.
 *
 * The deliberate counterpart to `removeCustomFieldDef`: blanks the slot on
 * every row for this project + discipline and leaves the column in place,
 * empty. Separate and explicit because it is the only irreversible action here.
 */
export const clearCustomFieldData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdOnly.parse(input))
  .handler(async ({ data }): Promise<{ rowsCleared: number }> => {
    const { def, actor } = await requireDefAccess(data.id);
    const field = customFieldForSlot(def.slot);
    if (!field) throw new Error(`No storage column for slot ${def.slot}.`);

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.fefRow.updateMany({
        where: { projectId: def.projectId, discipline: def.discipline },
        data: { [field]: "" },
      });
      await recordUpdate(
        tx,
        {
          entityType: "CustomFieldDef",
          entityId: data.id,
          projectId: def.projectId,
          actor,
        },
        [{ field: "data", oldValue: `${count} row(s)`, newValue: null }],
        `Cleared the "${def.label}" column across ${count} row(s).`,
      );
      return { rowsCleared: count };
    });
  });

/** Cache-bust after any definition change: the grid's columns just changed. */
export function invalidateCustomFieldQueries(
  queryClient: QueryClient,
  projectId: number | null,
  discipline: string,
): void {
  queryClient.invalidateQueries({
    queryKey: qk.customFieldDefs(projectId, discipline),
  });
  // Adding or clearing rewrites row data, so the sheets have to refetch too.
  queryClient.invalidateQueries({ queryKey: qk.fefRows.all() });
}

export { CUSTOM_FIELD_LABEL_MAX };
