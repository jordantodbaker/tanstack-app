import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  downloadCsv,
  rowsToCsv,
  todayStamp,
  type CsvColumn,
} from "~/lib/csv-export";

/**
 * "Export CSV" button for list pages. Wraps the rowsToCsv + downloadCsv
 * call so each list route only specifies what to export (items, columns,
 * filenamePrefix) instead of repeating the same handler body.
 *
 * Two modes:
 *  - `items` (sync): pass the array directly. The button uses it as-is.
 *  - `getItems` (async): pass a callback returning a Promise<T[]>. Used by
 *    list pages whose normal list endpoint returns a slim shape — the
 *    button hydrates the full rows (with narrative/description columns
 *    the CSV wants) only when the user actually clicks Export.
 *
 * Filename ends up as `{filenamePrefix}-{YYYY-MM-DD}.csv`.
 */
type ExportCsvButtonProps<T> = {
  columns: CsvColumn<T>[];
  /** Stem of the downloaded file. The date stamp + ".csv" are appended. */
  filenamePrefix: string;
  /** Disable the button (e.g. zero rows visible). Defaults to `false`. */
  disabled?: boolean;
} & (
  | { items: T[]; getItems?: never }
  | { items?: never; getItems: () => Promise<T[]> }
);

export function ExportCsvButton<T>(props: ExportCsvButtonProps<T>) {
  const { columns, filenamePrefix, disabled } = props;
  const [busy, setBusy] = React.useState(false);
  const isAsync = "getItems" in props && props.getItems !== undefined;
  const itemsEmpty = !isAsync && (props.items?.length ?? 0) === 0;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || disabled || itemsEmpty}
      onClick={async () => {
        setBusy(true);
        try {
          const rows = isAsync
            ? await props.getItems()
            : (props.items as T[]);
          const csv = rowsToCsv(rows, columns);
          downloadCsv(`${filenamePrefix}-${todayStamp()}.csv`, csv);
        } finally {
          setBusy(false);
        }
      }}
      title="Export the filtered list to a CSV file (opens in Excel)"
    >
      <Download className="size-3.5 mr-1" />
      {busy ? "Preparing…" : "Export CSV"}
    </Button>
  );
}
