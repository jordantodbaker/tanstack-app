import * as React from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "~/components/ui/button";
import { downloadBase64, XLSX_MIME } from "~/lib/csv-export";
import { cbsExporterFor } from "~/utils/cbsExport";
import type { CbsExportView } from "~/lib/cbs-export";
import type { CbsRowFilter } from "~/lib/cbs-tree";
import { logger } from "~/lib/logger";

/**
 * "Export Excel" for a CBS tree view.
 *
 * Sends the view plus the filter in force and lets the server rebuild the same
 * tree — so the file carries the rows on screen, and the browser never loads
 * exceljs. Collapsed branches are still exported: Excel's own row grouping is
 * what collapses them there.
 */
export function ExportCbsXlsxButton({
  view,
  projectId,
  filter,
  disabled,
}: {
  view: CbsExportView;
  /** Required by the project-scoped view; ignored by the catalog views. */
  projectId?: number | null;
  filter: CbsRowFilter;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const blocked =
    disabled || (view === "projectCostCodes" && (projectId ?? null) === null);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || blocked}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        try {
          const result = await cbsExporterFor(view)({
            data: { view, projectId: projectId ?? null, filter },
          });
          downloadBase64(result.filename, result.base64, XLSX_MIME);
        } catch (err) {
          logger.error("CBS Excel export failed", { view, projectId, err });
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
      title={
        failed
          ? "The export failed — try again"
          : "Export the rows shown (filters applied) to Excel, with colours and collapsible grouping"
      }
    >
      <FileSpreadsheet className="mr-1 size-3.5" />
      {busy ? "Preparing…" : failed ? "Export failed" : "Export Excel"}
    </Button>
  );
}
