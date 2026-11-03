import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "~/components/ui/input";
import { Labeled, NativeSelect } from "~/components/ui/form-helpers";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { formatAreaLabel } from "~/utils/areaLabels";

/**
 * Form fields the entity dialogs (CVR, FCO, RFI, Trend, PCO) share. Each was
 * written out in every dialog that had it, with its own copy of the query,
 * the option mapping, the text-state-and-parse-on-blur dance; the copies had
 * already begun to differ. The variation that is real — which label stands
 * for "none", what the help says — is a prop.
 */

/**
 * The callbacks a list page hands its entity dialog, which the dialog's outer
 * shell forwards to its body unchanged. One declaration instead of two per
 * dialog, and one place to add a fifth.
 */
export type EntityDialogCallbacks<TForm> = {
  onSubmit: (form: TForm) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
  /**
   * Run a workflow status transition. Only meaningful in edit mode; the
   * dialog renders one button per transition allowed by the current user's
   * role and originator status. See `~/lib/workflow`.
   */
  onTransition?: (input: { id: number; action: string }) => Promise<unknown>;
  /** Promote the record into its successor (FCO → CVR, RFI → FCO, Trend → CVR). */
  onPromote?: (id: number) => Promise<unknown>;
};

/**
 * The project's areas as a picker, with "none" as the first entry. Runs the
 * areas query itself; the help line explains an empty list.
 */
export function AreaField({
  projectId,
  value,
  onChange,
  noneLabel = "— None —",
  help,
  emptyHelp = "No areas defined. Add some in Admin → Areas.",
}: {
  projectId: number | null;
  /** The stored area id, or "" for none. */
  value: string;
  onChange: (v: string) => void;
  /** The "none" entry's label — "— None (project-wide) —" on a CVR. */
  noneLabel?: string;
  /** Help shown when there are areas to pick from. */
  help?: string;
  /** Help shown when the project has no areas. */
  emptyHelp?: string;
}) {
  const { data: areas = [] } = useQuery({
    ...areasByProjectQueryOptions(projectId),
    enabled: projectId !== null,
  });
  return (
    <Labeled
      label="Area"
      help={
        projectId === null
          ? "Select a project first."
          : areas.length === 0
            ? emptyHelp
            : help
      }
    >
      <NativeSelect
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: noneLabel },
          ...areas.map((a) => ({
            value: String(a.id),
            label: formatAreaLabel(String(a.id), areas),
          })),
        ]}
      />
    </Labeled>
  );
}

/** "P-101-A, M-303-B" → ["P-101-A", "M-303-B"]: split on commas and newlines, trimmed, blanks dropped. */
export function parseCommaList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A string-array column edited as comma-separated text. Owns the text while
 * it is being typed and parses it on blur, so the array only changes when
 * the user is done rather than on every keystroke; re-reads the array when
 * it changes from outside (a template applied, a record loaded).
 */
export function CommaListInput({
  value,
  onChange,
  placeholder,
}: {
  value: readonly string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = React.useState(() => value.join(", "));
  React.useEffect(() => {
    setText(value.join(", "));
  }, [value]);
  return (
    <Input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => onChange(parseCommaList(e.target.value))}
    />
  );
}

/**
 * A nullable foreign key as a picker: the linked record's id, or null for
 * none. Converts the select's "" to and from null so the dialogs need not.
 */
export function LinkedRecordSelect({
  value,
  onChange,
  options,
  noneLabel = "— None —",
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  /** The records that may be linked, already labelled (see `formatRecordRef`). */
  options: readonly { id: number; label: string }[];
  noneLabel?: string;
}) {
  return (
    <NativeSelect
      value={value === null ? "" : String(value)}
      onChange={(v) => onChange(v === "" ? null : Number(v))}
      options={[
        { value: "", label: noneLabel },
        ...options.map((o) => ({ value: String(o.id), label: o.label })),
      ]}
    />
  );
}
