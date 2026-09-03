import "@tanstack/react-table";
import type { FefTableMeta } from "./table-utils";
import type { CbsOption } from "~/lib/types";
import type { SearchableSelectOption } from "~/components/SearchableSelect";

declare module "@tanstack/react-table" {
  // The grid's table meta = the caller-supplied `FefTableMeta` (option lists,
  // the steel/piping lookups, areaOptions, selection state, the optional
  // deleteRow override) PLUS the fields `FefTableContent` attaches itself: the
  // row mutators and the `{ value, label }` lists it pre-maps once per grid.
  // Extending `FefTableMeta` keeps every shared field declared in exactly one
  // place (table-utils) instead of hand-mirrored here — adding a meta field no
  // longer means editing two type declarations in lockstep.
  interface TableMeta<TData extends RowData> extends FefTableMeta {
    updateData?: (rowIndex: number, columnId: string, value: string) => void;
    updateRow?: (rowIndex: number, updates: Record<string, string>) => void;
    // Pre-mapped `{ value, label }` lists for the dropdown cells, computed once
    // per grid (see FefTableContent) so each cell doesn't re-map its source.
    // `shortLabel` is the resting-cell text (the item name); `label` stays the
    // identifying "code: name" the open dropdown lists. See CellSelect.
    cbsSelectOptions?: {
      value: string;
      label: string;
      shortLabel?: string;
    }[];
    roleSelectOptions?: { value: string; label: string }[];
    scheduleSelectOptions?: { value: string; label: string }[];
    crewMixSelectOptions?: { value: string; label: string }[];
    // Read-path CBS lookup: displayCode → option, built once per grid so the
    // read-only Name/UoM/Sub cells do an O(1) get instead of an Array.find over
    // the ~1,800-item catalog on every render. Mirrors the write path's index.
    cbsByCode?: Map<string, CbsOption>;
    // SearchableSelect option lists pre-mapped once per grid (same rationale as
    // the {value,label} lists above) so each of the ~25 visible search cells
    // doesn't rebuild the list from its (large) source on mount.
    cbsSearchOptions?: SearchableSelectOption[];
    taskCodeSelectOptions?: SearchableSelectOption[];
    weldGroupSelectOptions?: SearchableSelectOption[];
  }
}
