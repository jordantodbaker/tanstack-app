import { ArrowUpRight, Printer, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import { DISCIPLINE_FILTER_OPTIONS } from "~/config/disciplines";
import { cn } from "~/lib/utils";

/**
 * Presentational pieces shared verbatim by the entity edit dialogs (CVR, FCO,
 * RFI, Trend, PCO). Each was copy-pasted across those files; extracting them
 * keeps the markup (and its class strings) in one place. They stay dumb — all
 * per-entity variation (href stem, promote label, submit predicate) is a prop.
 */

/** Header link that opens the entity's printable/PDF page in a new tab. */
export function PrintPdfLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      title="Open the printable / PDF version in a new tab"
    >
      <Printer className="size-3.5" />
      Print / PDF
    </a>
  );
}

/** Header "Promote to X" action (FCO→CVR, RFI→FCO, Trend→CVR). */
export function PromoteButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="text-violet-700 hover:bg-violet-50"
    >
      <ArrowUpRight className="size-3.5 mr-1" />
      {label}
    </Button>
  );
}

/** Header Delete action, shown only for an existing (editable) record. */
export function DeleteEntityButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="text-red-600 hover:bg-red-50 hover:text-red-700"
    >
      <Trash2 className="size-3.5 mr-1" />
      Delete
    </Button>
  );
}

/** The "Discipline" NativeSelect field with the shared "—" (none) option. */
export function DisciplineField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Labeled label="Discipline">
      <NativeSelect
        value={value}
        onChange={onChange}
        options={[{ value: "", label: "—" }, ...DISCIPLINE_FILTER_OPTIONS]}
      />
    </Labeled>
  );
}

/**
 * The dialog's bottom action bar: a Cancel that closes the dialog and a submit
 * button. `submitLabel` is the resolved non-busy label (e.g. "Save Changes" /
 * "Create FCO"); the busy state always shows "Saving…". `className` carries the
 * odd per-dialog wrapper extra (e.g. `shrink-0`).
 */
export function DialogFooterActions({
  busy,
  disabled,
  submitLabel,
  onSubmit,
  className,
}: {
  busy: boolean;
  disabled?: boolean;
  submitLabel: string;
  onSubmit: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 pt-2 border-t border-slate-200",
        className,
      )}
    >
      <DialogClose asChild>
        <Button variant="outline" type="button" disabled={busy}>
          Cancel
        </Button>
      </DialogClose>
      <Button type="button" onClick={onSubmit} disabled={disabled}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
