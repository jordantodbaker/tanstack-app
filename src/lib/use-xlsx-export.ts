import * as React from "react";
import { downloadBase64, XLSX_MIME } from "./csv-export";
import { logger } from "./logger";

/**
 * The shared half of an "Export Excel" button: ask the server for the file,
 * hand it to the browser, and keep the button honest while it waits.
 *
 * Every export in this app is built server-side and returned base64 — exceljs
 * is ~1 MB and the data and access guards are already there — so each button
 * was repeating the same busy flag, the same try/catch, the same
 * `downloadBase64` and the same error log. The buttons differ only in which
 * server function to call and how they look, so that is all they keep.
 */

/** What every CBS export server function returns. */
export type XlsxExportResult = { filename: string; base64: string };

export function useXlsxExport(
  run: () => Promise<XlsxExportResult>,
  /** Logged alongside a failure, to say which export broke. */
  context: Record<string, unknown>,
) {
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // `run` is usually an inline closure, so it changes every render. Hold it in
  // a ref and keep `start` stable, or every button re-renders on each keystroke
  // in the page around it.
  const latest = React.useRef(run);
  latest.current = run;
  const contextRef = React.useRef(context);
  contextRef.current = context;

  const start = React.useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await latest.current();
      downloadBase64(result.filename, result.base64, XLSX_MIME);
    } catch (err) {
      logger.error("Excel export failed", { ...contextRef.current, err });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, failed, start };
}
