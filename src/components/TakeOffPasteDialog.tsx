import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import type { CbsOption, FefRow } from "~/lib/types";
import {
  parseTakeOffPaste,
  extractTakeOffCodes,
  TAKE_OFF_PASTE_COLUMNS,
  type AreaMatchOption,
} from "~/lib/take-off-paste";
import { cbsCodeResolveQueryOptions } from "~/utils/cbs";

/** Debounce a fast-changing value so keystrokes don't each fire a query. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * "Paste from Excel" for the Take Off sheet. The user pastes a tab-separated
 * block; it's parsed into rows and appended to the grid on confirm. CBS codes
 * are resolved against the WHOLE catalog (server-side), so codes from any
 * discipline — not just the current one — are recognized. A live preview shows
 * the row count and flags any codes that still don't resolve.
 */
export function TakeOffPasteDialog({
  cbsOptions,
  areaOptions = [],
  onAppend,
}: {
  cbsOptions: CbsOption[];
  /** Area id + label pairs; an Area cell can be pasted as either. */
  areaOptions?: AreaMatchOption[];
  onAppend: (rows: FefRow[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");

  // Resolve every pasted code against the full catalog (debounced).
  const codes = React.useMemo(() => extractTakeOffCodes(text), [text]);
  const debouncedCodes = useDebouncedValue(codes, 300);
  const { data: resolved = [], isFetching } = useQuery(
    cbsCodeResolveQueryOptions(debouncedCodes),
  );
  const resolving = isFetching && codes.length > 0;

  // Merge the current discipline's options with the server-resolved catalog
  // hits, so parsing recognizes a code from any discipline.
  const mergedOptions = React.useMemo<CbsOption[]>(
    () => [
      ...cbsOptions,
      ...resolved.map((r) => ({
        displayCode: r.displayCode,
        costCode: r.costCode,
        name: r.name,
        uom: r.uom,
        displayDescription: null,
        subReporting: null,
      })),
    ],
    [cbsOptions, resolved],
  );

  const parsed = React.useMemo(
    () => parseTakeOffPaste(text, mergedOptions, areaOptions),
    [text, mergedOptions, areaOptions],
  );
  const count = parsed.rows.length;

  function handleAdd() {
    if (count === 0) return;
    onAppend(parsed.rows);
    setText("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
        >
          Paste from Excel
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>Paste Take Off rows from Excel</DialogTitle>
        <DialogDescription>
          Copy cells from a spreadsheet and paste below. Columns, in order:{" "}
          <span className="font-medium text-slate-700">
            {TAKE_OFF_PASTE_COLUMNS.join(" · ")}
          </span>
          . A CBS code (from any discipline) fills the row's name and unit; Labor
          Hours is computed from Quantity × Labor Factor.
        </DialogDescription>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={
            "601-C0-0000-00-M\tCarbon Steel Pipe\t100\t1.5\t55\n012-05-5000-00-L\tMarketing\t40\t1\t50"
          }
          className="w-full rounded border border-slate-300 p-2 font-mono text-xs focus:border-blue-400 focus:outline-none"
        />

        <div className="min-h-8 text-xs text-slate-600">
          {text.trim() === "" ? (
            "Paste tab-separated rows above (one row per line)."
          ) : (
            <>
              <span className="font-medium text-slate-700">
                {count} row{count === 1 ? "" : "s"}
              </span>{" "}
              ready to add.
              {resolving ? (
                <span className="ml-1 text-slate-400">resolving codes…</span>
              ) : (
                parsed.unmatchedCodes.length > 0 && (
                  <span className="mt-1 block text-amber-700">
                    {parsed.unmatchedCodes.length} unrecognized CBS code
                    {parsed.unmatchedCodes.length === 1 ? "" : "s"} (kept as
                    typed): {parsed.unmatchedCodes.slice(0, 5).join(", ")}
                    {parsed.unmatchedCodes.length > 5 ? "…" : ""}
                  </span>
                )
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={count === 0 || resolving}
          >
            Add {count > 0 ? `${count} ` : ""}row{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
