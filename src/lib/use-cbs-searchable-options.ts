import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { cbsCodeOptionsQueryOptions } from "~/utils/cbs";
import type { SearchableSelectOption } from "~/components/SearchableSelect";

/**
 * CBS-code multi-select options for every entity dialog. The mapping from
 * CbsCodeOption → SearchableSelectOption is byte-for-byte identical across
 * the five entity dialogs; this hook bundles the query + the memo so
 * dialog bodies stay focused on entity-specific markup.
 */
export function useCbsSearchableOptions(): SearchableSelectOption[] {
  const { data: cbsCodeOptions = [] } = useQuery(cbsCodeOptionsQueryOptions());
  return React.useMemo(
    () =>
      cbsCodeOptions.map((c) => ({
        value: c.displayCode,
        label: c.name ? `${c.displayCode} — ${c.name}` : c.displayCode,
        searchText: `${c.displayCode} ${c.name ?? ""}`.toLowerCase(),
      })),
    [cbsCodeOptions],
  );
}
