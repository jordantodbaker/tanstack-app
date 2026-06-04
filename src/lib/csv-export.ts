/**
 * CSV export primitives. Browser-side: row data → CSV string → `Blob`
 * download via an invisible `<a download>`. Excel opens the resulting file
 * natively when the `﻿` UTF-8 BOM is prepended (it auto-detects
 * encoding from the BOM rather than guessing).
 *
 * No external dependency. If owners ever ask for cell formatting / multi-
 * sheet workbooks / formulas, swap in `exceljs` and keep the call sites.
 */

export type CsvColumn<T> = {
  /** Header row label. */
  header: string;
  /** Value extractor. Return `null` / `undefined` / `""` for an empty cell. */
  get: (row: T) => string | number | boolean | null | undefined;
};

/**
 * Quote a cell value per RFC 4180 — wrap in double quotes when it contains
 * a comma, double-quote, CR, or LF, and escape embedded double-quotes by
 * doubling them. Numbers / booleans are stringified verbatim.
 */
function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s === "") return "";
  // The four characters that require RFC 4180 quoting.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serializes `rows` to a CSV string with `columns` as the header row.
 * Returns the raw CSV text — `downloadCsv` handles the BOM + download.
 */
export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCell(c.get(row))).join(","),
  );
  // Use CRLF line endings — Windows-safe and what Excel emits itself when
  // saving as CSV. POSIX tooling reads them fine.
  return [header, ...lines].join("\r\n") + "\r\n";
}

/**
 * Triggers a browser download of `csv` as `filename`. Prepends a UTF-8 BOM
 * so Excel renders Unicode (e.g. the "—" character in our discipline
 * labels) correctly instead of as `â`.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Release the blob URL after the click handler has had a chance to run.
  // setTimeout 0 is enough — the click is synchronous in practice but the
  // browser still needs the URL valid through the download dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Today's date in YYYY-MM-DD, suitable for filename stems. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cell-value formatters shared by every per-entity CSV column module
 * (changelogCsv, fcoLogCsv, rfisCsv, …). The same four patterns repeated
 * once per file: take the YYYY-MM-DD prefix of an ISO date, join an array
 * with a stable separator, render a boolean as Yes/No, and resolve a
 * discipline id to its display label.
 */
import { disciplineById } from "~/config/disciplines";

/** YYYY-MM-DD prefix; "" for null/undefined/empty. */
export const fmtDate = (iso: string | null | undefined): string =>
  iso?.slice(0, 10) ?? "";

/** Joins a string array with "; " (semicolons survive CSV's comma escaping). */
export const fmtList = (arr: readonly string[]): string => arr.join("; ");

/** "Yes" / "No" — the rendering used in every CSV export today. */
export const fmtBool = (b: boolean): string => (b ? "Yes" : "No");

/** Discipline id → label; falls back to the raw id when unknown. */
export const fmtDiscipline = (id: string): string =>
  disciplineById[id]?.label ?? id;
