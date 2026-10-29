import * as React from "react";
import {
  CBS_VALUE_FILTERS,
  cbsFilterIsEmpty,
  cbsNoCostTypes,
  cbsNoStatuses,
  cbsNoValues,
  cbsValueFilterOptions,
  type CbsCostTypeKey,
  type CbsRowFilter,
  type CbsRowTypeFilter,
  type CbsStatusKey,
  type CbsTreeItem,
  type CbsValueFilterKey,
} from "~/lib/cbs-tree";
import type { CbsTreeFilterControls } from "~/components/Cbs/CbsTreeToolbar";

/**
 * The state behind a CBS tree's toolbar: the search box and every filter row,
 * folded into the one `CbsRowFilter` that `pruneCbsTree`, `filterCbsTree` and
 * the Excel export all take.
 *
 * Every CBS tree offers the same filters, Status and Row Type apart (those
 * are the Dictionary's, so a page opts into them). The value pickers'
 * option lists are counted from `items`, the rows the view lists, so a picker
 * never offers a value that could only filter to nothing.
 *
 * Every filter is always in the returned `filter`; a page that does not offer
 * one simply never changes it from its "everything" value, and its control is
 * left off the toolbar because the handler is not handed out.
 */
export function useCbsRowFilter({
  items,
  statusFilter = false,
  rowTypeFilter = false,
  deferQuery = false,
}: {
  /** The rows the view lists — what the value pickers offer values from. */
  items: readonly CbsTreeItem[];
  /** Offer Active / Inactive / Retired. */
  statusFilter?: boolean;
  /** Offer All / Original / Generated. */
  rowTypeFilter?: boolean;
  /**
   * Filter on a deferred copy of the search text, so typing stays responsive
   * over a tree too large to re-filter per keystroke. `searchPending` is true
   * while the filter lags the box.
   */
  deferQuery?: boolean;
}): {
  filter: CbsRowFilter;
  /** True when any filter narrows the rows. */
  filtering: boolean;
  /** True while a deferred search has not caught up with the box. */
  searchPending: boolean;
  /** Spread into `CbsTreeToolbar`. */
  controls: CbsTreeFilterControls;
} {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const appliedQuery = deferQuery ? deferredQuery : query;

  const [values, setValues] = React.useState(cbsNoValues);
  const setValue = React.useCallback(
    (key: CbsValueFilterKey, next: string[]) =>
      setValues((prev) => ({ ...prev, [key]: next })),
    [],
  );
  const valueOptions = React.useMemo(
    () => cbsValueFilterOptions(items),
    [items],
  );

  const [costTypes, setCostTypes] = React.useState(cbsNoCostTypes);
  const toggleCostType = React.useCallback((key: CbsCostTypeKey) => {
    setCostTypes((prev) => ({ ...prev, [key]: !prev[key] }));
    // A picker that belongs to a cost type (Material Type to Materials)
    // starts fresh each time that type is pressed rather than reviving an
    // old pick.
    const owned = CBS_VALUE_FILTERS.filter((v) => v.requiresCostType === key);
    if (owned.length > 0) {
      setValues((prev) => ({
        ...prev,
        ...Object.fromEntries(owned.map((v) => [v.key, []])),
      }));
    }
  }, []);

  const [statuses, setStatuses] = React.useState(cbsNoStatuses);
  const toggleStatus = React.useCallback(
    (key: CbsStatusKey) =>
      setStatuses((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );
  const [rowType, setRowType] = React.useState<CbsRowTypeFilter>("all");

  const filter: CbsRowFilter = React.useMemo(
    () => ({
      query: appliedQuery.trim().toLowerCase(),
      rowType,
      ...values,
      ...costTypes,
      ...statuses,
    }),
    [appliedQuery, rowType, values, costTypes, statuses],
  );

  return {
    filter,
    filtering: !cbsFilterIsEmpty(filter),
    searchPending: deferQuery && query !== deferredQuery,
    controls: {
      query,
      onQueryChange: setQuery,
      costTypes,
      onToggleCostType: toggleCostType,
      values,
      onValueChange: setValue,
      valueOptions,
      statuses,
      onToggleStatus: statusFilter ? toggleStatus : undefined,
      rowType,
      onRowTypeChange: rowTypeFilter ? setRowType : undefined,
    },
  };
}
