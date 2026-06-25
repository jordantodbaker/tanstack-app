import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { cbsCodeSearchQueryOptions } from "~/utils/cbs";
import { SearchableSelect } from "~/components/SearchableSelect";

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
 * Single-select CBS-code picker (e.g. a CVR cost-buildup line). Server-side
 * search a small page at a time instead of loading the whole ~5k catalog.
 * The selected code falls back to showing its raw value when it isn't in the
 * current result page (see SearchableSelect), so saved codes still display.
 */
export function CbsSelect({
  value,
  onSelect,
  placeholder = "— CBS item —",
}: {
  value: string;
  onSelect: (value: string) => void;
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
    <SearchableSelect
      value={value}
      options={options}
      placeholder={placeholder}
      onSelect={onSelect}
      onSearchChange={setQuery}
      loading={isFetching}
    />
  );
}
