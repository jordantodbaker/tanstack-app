import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { cbsCodeSearchQueryOptions } from "~/utils/cbs";
import { SearchableMultiSelect } from "~/components/SearchableMultiSelect";

/** Debounce a fast-changing value so each keystroke doesn't fire a query. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * CBS-code multi-select used by every entity dialog (Affected CBS Codes).
 * Searches the catalog server-side a small page at a time instead of loading
 * all ~5k items up front, so opening a dialog stays cheap. Selected codes show
 * as chips from their raw value, so they persist even when not in the current
 * result page. Drop-in for the prior `SearchableMultiSelect` + all-rows hook.
 */
export function CbsMultiSelect({
  values,
  onChange,
  placeholder = "Search CBS items…",
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const { data = [], isFetching } = useQuery(
    cbsCodeSearchQueryOptions(debouncedQuery),
  );

  const options = React.useMemo(
    () =>
      data.map((c) => ({
        value: c.displayCode,
        label: c.name ? `${c.displayCode} — ${c.name}` : c.displayCode,
        searchText: `${c.displayCode} ${c.name ?? ""}`.toLowerCase(),
      })),
    [data],
  );

  return (
    <SearchableMultiSelect
      values={values}
      options={options}
      placeholder={placeholder}
      onChange={onChange}
      onSearchChange={setQuery}
      loading={isFetching}
    />
  );
}
