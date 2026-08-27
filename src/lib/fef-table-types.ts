import type React from "react";
import type { ColumnFiltersState } from "@tanstack/react-table";
import type { CbsOption, FefRow } from "~/lib/types";

/**
 * Shared type surface for the FEF table.
 *
 * Split out of `table-utils.tsx` so `use-grid-range-editing.ts` can consume
 * these without importing the module that imports it. `table-utils` re-exports
 * everything here, so `~/lib/table-utils` remains the public entry point and
 * existing imports are unaffected.
 */

export type RoleRate = { roleName: string; schedule: string; rate: number };

export type TaskCodeOption = { code: string; taskDefinition: string };
export type AreaSelectOption = { value: string; label: string };
/** Shape shared with `SearchableSelectOption` (kept local to avoid a table-utils
 *  ↔ SearchableSelect import cycle). */
export type SearchableSelectOptionMeta = {
  value: string;
  label: string;
  searchText?: string;
};
export type CrewMixOption = {
  id: number;
  name: string;
  schedule: string;
  members: { roleName: string; count: number }[];
};

export type FefTableMeta = {
  cbsOptions?: CbsOption[];
  weldGroupOptions?: string[];
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >;
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: RoleRate[];
  crewMixOptions?: CrewMixOption[];
  taskCodeOptions?: TaskCodeOption[];
  /** Structural-steel members (SLTO_Data) for the steel-only Task Code
   *  searchable dropdown, pre-mapped to `{ value, label, searchText }`. */
  steelMemberOptions?: SearchableSelectOptionMeta[];
  /** Member designation → QTO UoM (SLTO_Data); fills the Unit column when a
   *  steel Task Code is selected. */
  steelMemberUomLookup?: Record<string, string>;
  /** Member designation → TNS/Unit (SLTO_Data); Total Tons = Quantity × this. */
  steelMemberTonsLookup?: Record<string, number>;
  pipingFactorLookup?: Map<
    string,
    { unit: string; values: Map<number, number> }
  >;
  areaOptions?: AreaSelectOption[];
  selectedRowIndices?: Set<number>;
  onToggleRowSelected?: (rowIndex: number) => void;
  /** Optional override for the default delete behavior. Lets callers also
   *  adjust ancillary state (e.g. selection sets) atomically with deletion. */
  deleteRow?: (rowIndex: number) => void;
};

export type FefTableState = {
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
};

export type ServerPagination = {
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

/** Callbacks the range-editing rows use to report pointer/focus and start a
 *  fill-handle drag. All are stable (useCallback) so they don't defeat the
 *  row memo. */
export type RangeRowHandlers = {
  onCellPointerDown: (
    rowIndex: number,
    colIndex: number,
    e: React.MouseEvent,
  ) => void;
  onCellFocus: (rowIndex: number, colIndex: number) => void;
  onFillHandleDown: (e: React.MouseEvent) => void;
  onCellContextMenu: (
    rowIndex: number,
    colIndex: number,
    e: React.MouseEvent,
  ) => void;
  onRowHeaderClick: (rowIndex: number) => void;
};

/** Sticky-left placement for a frozen (pinned) column. */
export type FrozenColumn = { left: number; width: number };

/** Width of the row-number gutter, in px. Frozen columns' sticky-left offsets
 *  start after it. */
export const GUTTER_WIDTH = 44;

/**
 * A toggleable set of columns. `banner: true` (the default) also draws a
 * grouped-header band above the set, which requires the columns to be
 * contiguous; `banner: false` makes it chip-only, for logical groups whose
 * columns are scattered across the sheet.
 */
export type ColumnGroup = {
  label: string;
  columnIds: string[];
  defaultCollapsed?: boolean;
  banner?: boolean;
};
