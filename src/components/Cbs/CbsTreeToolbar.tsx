import * as React from "react";
import { ChevronDown } from "lucide-react";
import { SearchBox } from "~/components/SearchBox";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  CBS_COST_TYPES,
  CBS_BLANK_VALUE,
  CBS_ROW_TYPE_FILTERS,
  CBS_STATUSES,
  type CbsRowTypeFilter,
  type CbsValueOption,
  type CbsCostTypeKey,
  type CbsStatusKey,
} from "~/lib/cbs-tree";

const valueLabel = (value: string) =>
  value === CBS_BLANK_VALUE ? "(none)" : value;

/**
 * A multi-select over one free-text column — Cost Classification, Material
 * Type: a button naming what is picked, and a checkbox list under it. A list
 * rather than buttons: the workbook carries too many values for a row of
 * toggles.
 */
function ValuePicker({
  label,
  plural,
  selected,
  options,
  onChange,
}: {
  /** "Cost classification" — the caption, and the picker's accessible name. */
  label: string;
  /** "classifications" — for "All classifications" / "3 classifications". */
  plural: string;
  selected: readonly string[];
  options: readonly CbsValueOption[];
  onChange: (next: string[]) => void;
}) {
  const picked = new Set(selected);
  const toggle = (value: string) =>
    onChange(
      // Kept in the list's order, not the click order, so the export's filter
      // note reads the same however the boxes were ticked.
      options
        .map((o) => o.value)
        .filter((v) => (v === value ? !picked.has(v) : picked.has(v))),
    );
  const summary =
    selected.length === 0
      ? `All ${plural}`
      : selected.length === 1
        ? valueLabel(selected[0])
        : `${selected.length} ${plural}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">{label}:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={selected.length > 0 ? "default" : "outline"}
            size="sm"
            aria-label={`${label}: ${summary}`}
          >
            {summary}
            <ChevronDown className="ml-1 size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-1">
          <div
            role="group"
            aria-label={`Filter by ${label.toLowerCase()}`}
            className="max-h-80 overflow-auto"
          >
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-100"
              >
                <input
                  type="checkbox"
                  aria-label={valueLabel(o.value)}
                  checked={picked.has(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span className="truncate">{valueLabel(o.value)}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums">
                  {o.count.toLocaleString()}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end border-t border-slate-100 p-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Row Type: one of All / Original / Generated, as a segmented control. */
function RowTypeToggle({
  value,
  onChange,
}: {
  value: CbsRowTypeFilter;
  onChange: (next: CbsRowTypeFilter) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="radiogroup"
      aria-label="Filter by row type"
    >
      <span className="text-xs text-slate-500">Row type:</span>
      {CBS_ROW_TYPE_FILTERS.map((r) => (
        <Button
          key={r.key}
          role="radio"
          aria-checked={value === r.key}
          variant={value === r.key ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(r.key)}
          title={
            r.key === "generated"
              ? "Only rows generated from an original — Original Row FALSE in the CBS"
              : r.key === "original"
                ? "Only original rows — Original Row TRUE in the CBS"
                : "Every row"
          }
        >
          {r.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * The filter half of the toolbar's props — the search box and every filter
 * row. `useCbsRowFilter` returns exactly this, so a page spreads it in.
 */
export type CbsTreeFilterControls = {
  query: string;
  onQueryChange: (value: string) => void;
  /** Which cost-type filters are on. Omit the handler to leave them out. */
  costTypes?: Record<CbsCostTypeKey, boolean>;
  onToggleCostType?: (key: CbsCostTypeKey) => void;
  /** Which status filters are on. Omit the handler to leave the row out. */
  statuses?: Record<CbsStatusKey, boolean>;
  onToggleStatus?: (key: CbsStatusKey) => void;
  /**
   * The Cost Classifications picked, empty for all. Omit the handler to leave
   * the picker out.
   */
  classifications?: readonly string[];
  onClassificationsChange?: (next: string[]) => void;
  /** The classifications to offer — see `cbsClassificationOptions`. */
  classificationOptions?: readonly CbsValueOption[];
  /** All / Original / Generated. Omit the handler to leave the row out. */
  rowType?: CbsRowTypeFilter;
  onRowTypeChange?: (next: CbsRowTypeFilter) => void;
  /**
   * The Material Types picked, empty for all. Omit the handler to leave the
   * picker out — the Dictionary passes it only while Materials is on.
   */
  materialTypes?: readonly string[];
  onMaterialTypesChange?: (next: string[]) => void;
  /** The Material Types on the Materials lines — see `cbsMaterialTypeOptions`. */
  materialTypeOptions?: readonly CbsValueOption[];
};

/**
 * Rows for a CBS tree: the cost-type, status and classification filters, then
 * the search box with
 * Expand all / Collapse all and a trailing slot for page-specific controls
 * (the Excel export, a match count, a selected count, saving…). Shared by the
 * Setup editor and the CBS dictionary viewers.
 *
 * The filters get a row of their own, under the level-color legend, because
 * sharing one line with the search box put five toggles that change WHICH
 * rows exist beside the controls that only change how they are shown.
 */
export function CbsTreeToolbar({
  query,
  onQueryChange,
  placeholder = "Search code or name…",
  onExpandAll,
  onCollapseAll,
  costTypes,
  onToggleCostType,
  statuses,
  onToggleStatus,
  classifications = [],
  onClassificationsChange,
  classificationOptions = [],
  rowType = "all",
  onRowTypeChange,
  materialTypes = [],
  onMaterialTypesChange,
  materialTypeOptions = [],
  children,
}: CbsTreeFilterControls & {
  placeholder?: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      {onToggleCostType && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by cost type"
        >
          <span className="text-xs text-slate-500">Cost types:</span>
          {CBS_COST_TYPES.map((t) => {
            const on = costTypes?.[t.key] ?? false;
            return (
              <Button
                key={t.key}
                variant={on ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleCostType(t.key)}
                aria-pressed={on}
                title={`Show only ${t.label.toLowerCase()} codes — those ending in -${t.code}`}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      )}
      {/* Directly under the cost types: it only appears while Materials is
          on, and only narrows the Materials lines. */}
      {onMaterialTypesChange && (
        <ValuePicker
          label="Material type"
          plural="material types"
          selected={materialTypes}
          options={materialTypeOptions}
          onChange={onMaterialTypesChange}
        />
      )}
      {onToggleStatus && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by status"
        >
          <span className="text-xs text-slate-500">Status:</span>
          {CBS_STATUSES.map((s) => {
            const on = statuses?.[s.key] ?? false;
            return (
              <Button
                key={s.key}
                variant={on ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleStatus(s.key)}
                aria-pressed={on}
                title={`Show only codes with Status ${s.label}${s.key === "active" ? " (a blank Status counts as Active)" : ""}`}
              >
                {s.label}
              </Button>
            );
          })}
        </div>
      )}
      {onRowTypeChange && (
        <RowTypeToggle value={rowType} onChange={onRowTypeChange} />
      )}
      {onClassificationsChange && (
        <ValuePicker
          label="Cost classification"
          plural="classifications"
          selected={classifications}
          options={classificationOptions}
          onChange={onClassificationsChange}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={query}
          onChange={onQueryChange}
          placeholder={placeholder}
          ariaLabel="Search this CBS hierarchy"
          className="h-8 w-72"
        />
        <Button variant="outline" size="sm" onClick={onExpandAll}>
          Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={onCollapseAll}>
          Collapse all
        </Button>
        {children}
      </div>
    </div>
  );
}
