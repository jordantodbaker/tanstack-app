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
 * Disabled when there are no items so the user can't download an empty
 * file. Filename ends up as `{filenamePrefix}-{YYYY-MM-DD}.csv`.
 */
export function ExportCsvButton<T>({
  items,
  columns,
  filenamePrefix,
}: {
  items: T[];
  columns: CsvColumn<T>[];
  /** Stem of the downloaded file. The date stamp + ".csv" are appended. */
  filenamePrefix: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={items.length === 0}
      onClick={() => {
        const csv = rowsToCsv(items, columns);
        downloadCsv(`${filenamePrefix}-${todayStamp()}.csv`, csv);
      }}
      title="Export the filtered list to a CSV file (opens in Excel)"
    >
      <Download className="size-3.5 mr-1" />
      Export CSV
    </Button>
  );
}
