import React from "react";
import {
  CellSelect,
  editableCellClass,
  readOnlyCellClass,
  TextCell,
  writeCtxOf,
  type CellProps,
} from "~/lib/table-utils";
import { deriveRowPatch } from "~/lib/grid-range";
import { computeBoreSize } from "~/lib/utils";
import {
  computeTotalCost,
  computeUnitCost,
  computeUnitHours,
} from "~/lib/fef-derive";
import { laborFactorFor } from "~/lib/piping-derive";
import { SearchableSelect } from "~/components/SearchableSelect";

export { ReadOnlyCell } from "~/lib/table-utils";
// Re-exported so existing importers (and cells.test.ts) keep their import path
// while the derivation itself lives in the React-free lib module.
export { deriveLaborHours } from "~/lib/piping-derive";

/**
 * The piping take-off's cells.
 *
 * Every editor here writes through `deriveRowPatch` — the same step a range
 * paste runs after parsing its text — so the fields coupled to the one being
 * edited (the bore size, the labor hours, the metallurgy code, the CBS stamp,
 * the labor rate) are derived in exactly one place. Until 2026-11-03 each
 * editor carried its own copy of that derivation, and the two drifted.
 *
 * The derivation reads the grid's `WriteCtx` off the table meta (see
 * `writeCtxOf`), so the lookups are indexed once per grid rather than
 * scanned per edit.
 */

/** Store `value` in `colId`, with everything coupled to it. */
function commit(
  { row, table }: Pick<CellProps, "row" | "table">,
  colId: string,
  value: string,
): void {
  const patch = deriveRowPatch(colId, value, row.original, writeCtxOf(table));
  if (patch) table.options.meta?.updateRow?.(row.index, patch);
}

/**
 * Shop / Field. Selecting one re-derives the metallurgy code from the weld
 * group and re-resolves the CBS item from it, so the sheet never asserts a
 * code that contradicts the inputs beside it.
 */
export function ShopFieldSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  return (
    <select
      className={editableCellClass}
      value={value}
      onChange={(e) => commit({ row, table }, "shopField", e.target.value)}
    >
      <option value="">-- Select --</option>
      <option value="Shop">Shop</option>
      <option value="Field">Field</option>
    </select>
  );
}

/**
 * Fabricate / Erect — the two work types the piping cost codes separate. The
 * catalog fuses the choice onto a NOMINAL SIZE inside segment 3
 * (640-LB-12ER-00-L, 640-LB-12FB-00-L), so it only sharpens the CBS match on a
 * row that also has a size; without one the row keeps resolving to its bore
 * rollup. Re-resolves the item on change for the same reason Shop/Field does.
 */
export function FabricateErectSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  return (
    <select
      aria-label="Fabricate / Erect"
      className={editableCellClass}
      value={value}
      onChange={(e) => commit({ row, table }, "fabricateErect", e.target.value)}
    >
      <option value="">-- Select --</option>
      <option value="Fabricate">Fabricate</option>
      <option value="Erect">Erect</option>
    </select>
  );
}

export function WeldGroupSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  // Pre-mapped once per grid (see FefTableContent).
  const options = table.options.meta?.weldGroupSelectOptions ?? [];
  return (
    <SearchableSelect
      value={value}
      options={options}
      onSelect={(classification) =>
        commit({ row, table }, "weldGroupDescription", classification)
      }
    />
  );
}

export function SubCheckboxCell({ row, table }: CellProps) {
  const match = table.options.meta?.cbsByCode?.get(row.original.id);
  const enabled = !!match && match.subReporting === true;
  const checked = row.original.sub === "true";

  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        aria-label="Sub reporting"
        checked={checked}
        disabled={!enabled}
        onChange={(e) => {
          table.options.meta?.updateData?.(
            row.index,
            "sub",
            e.target.checked ? "true" : "",
          );
        }}
        className={
          enabled
            ? "h-4 w-4 cursor-pointer accent-[#a63434]"
            : "h-4 w-4 cursor-not-allowed accent-slate-400 opacity-50"
        }
      />
    </div>
  );
}

/**
 * Read-only Pipe Category: SB / MB / LB / XB for the row's nominal size.
 *
 * These are the same bands `computeBoreSize` feeds into the bore segment of a
 * piping cost code, so the column doubles as a read-out of which bore series
 * the row's CBS item came from — a 30" line shows XB and resolves against the
 * "-XB-" codes. One band table, so the two can't disagree.
 *
 * Derived on view rather than stored: it carries no row field of its own, so
 * it can never drift from the Size beside it and never triggers a save — see
 * `LaborHoursCell` for what storing a view-time derivation used to cost.
 */
export function PipeCategoryCell({ row }: CellProps) {
  return (
    <span className={readOnlyCellClass}>
      {computeBoreSize(row.original.size)}
    </span>
  );
}

export function TotalCostCell({ row }: CellProps) {
  const { laborHours, laborRate } = row.original;
  return (
    <span className={readOnlyCellClass}>
      {computeTotalCost(laborHours, laborRate)}
    </span>
  );
}

/** Installed cost of a single unit — Total Cost spread over Quantity. */
export function UnitRateCell({ row }: CellProps) {
  const { laborHours, laborRate, quantity } = row.original;
  return (
    <span className={readOnlyCellClass}>
      {computeUnitCost(laborHours, laborRate, quantity)}
    </span>
  );
}

/** Hours to install a single unit — Labor Hours spread over Quantity. */
export function UnitHoursCell({ row }: CellProps) {
  const { laborHours, quantity } = row.original;
  return (
    <span className={readOnlyCellClass}>
      {computeUnitHours(laborHours, quantity)}
    </span>
  );
}

/**
 * Role. Changing it snaps the Labor Rate to the matching cell of the rate
 * matrix for the row's schedule, or clears it when there is none.
 */
export function RoleSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  const options = table.options.meta?.roleSelectOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={options}
      ariaLabel="Role"
      onValueChange={(v) => commit({ row, table }, "role", v)}
    />
  );
}

/**
 * "Use Crew Mix" mode of the labor-rate input. Stores the selected crew
 * mix's id (as a string) on `crewMixId` and snapshots the average wage onto
 * `laborRate`, clearing Role and Schedule so the row's rate source is
 * unambiguous. Like `RoleSelectCell`, the rate is frozen at edit time —
 * editing the crew mix's members later won't retroactively touch rows.
 */
export function CrewMixSelectCell({ row, table }: CellProps) {
  const value = row.original.crewMixId;
  const options = table.options.meta?.crewMixSelectOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={options}
      ariaLabel="Crew Mix"
      onValueChange={(id) => commit({ row, table }, "crewMixId", id)}
    />
  );
}

export function LaborFactorCell({ row, table }: CellProps) {
  const factor = laborFactorFor(
    row.original,
    table.options.meta?.pipingFactorLookup,
  );
  return (
    <span className={readOnlyCellClass}>
      {factor !== undefined ? String(factor) : ""}
    </span>
  );
}

/**
 * Pure display. The stored value is the authoritative one — derivation
 * happens at edit time inside `TaskCodeSelectCell`, `PipingSizeCell`, and
 * `PipingQuantityCell`. View-time recompute used to write back via effect,
 * which generated a save on every row whose stored value diverged from the
 * current piping-factor table (e.g. after a factor CSV update).
 */
export function LaborHoursCell({ row }: CellProps) {
  return <span className={readOnlyCellClass}>{row.original.laborHours}</span>;
}

/**
 * Task code. Re-derives Labor Hours from the factor table, re-resolves the
 * CBS item from the row's other inputs, and takes the Unit from the item
 * when one resolved, else from the task code's own factor-table entry.
 */
export function TaskCodeSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  // Pre-mapped once per grid (see FefTableContent).
  const options = table.options.meta?.taskCodeSelectOptions ?? [];
  return (
    <SearchableSelect
      value={value}
      options={options}
      onSelect={(newCode) => commit({ row, table }, "taskCode", newCode)}
    />
  );
}

/** Size. Drives the bore size, the factor lookup and the CBS match. */
export function PipingSizeCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(value) => commit({ row, table }, "size", value)}
    />
  );
}

/**
 * Quantity cell that keeps `laborHours` in sync when the user types a new
 * quantity. Replaces the generic `EditableCell` on the piping take-off's
 * quantity column — without this, changing quantity would update `quantity`
 * alone and leave `laborHours` stale.
 */
export function PipingQuantityCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(value) => commit({ row, table }, "quantity", value)}
    />
  );
}

/** Schedule. Snaps the Labor Rate the way `RoleSelectCell` does. */
export function ScheduleSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  const options = table.options.meta?.scheduleSelectOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={options}
      ariaLabel="Schedule"
      onValueChange={(v) => commit({ row, table }, "schedule", v)}
    />
  );
}
