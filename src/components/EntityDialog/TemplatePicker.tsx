import * as React from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { NativeSelect } from "~/components/ui/form-helpers";

/** Picker payload — slim shape shared by CVR + FCO template lists. */
type PickerItem = {
  id: number;
  name: string;
  templateDescription: string;
  discipline: string;
  usageCount: number;
};

// Per-entity `queryOptions()` helpers return typed-query-key objects whose
// literal queryKey tuples differ between entities. The picker only needs
// the data shape; type the input loosely and let useQuery widen at the
// boundary, same as in EntityDialogShell.
type PickerQueryOptions = UseQueryOptions<
  PickerItem[],
  Error,
  PickerItem[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/**
 * "Start from template" picker rendered at the top of CVR/FCO dialogs in
 * CREATE mode. Lazy-loads the picker list on dialog open (the parent
 * EntityDialogShell guarantees we only mount when the dialog is open), so
 * the slim payload doesn't ship to users who never open a new-CVR dialog.
 *
 * Sorting: templates whose `discipline` matches `currentDiscipline` come
 * first (most-used within that discipline first), then "Any discipline"
 * templates, then non-matching disciplines. Within each group the server
 * already sorted by `usageCount desc, name asc`.
 *
 * Selection fires `onSelect` with the full field set returned by the
 * `instantiate` server fn — that fn also bumps the template's usage count.
 * The dialog body's `setForm` then merges those fields into the draft, and
 * the user reviews + saves like any other create.
 */
export function TemplatePicker<TFields>({
  pickerQueryOptions,
  instantiate,
  currentDiscipline,
  onSelect,
  noun,
}: {
  pickerQueryOptions: () => PickerQueryOptions;
  /** Server fn that fetches the template's full templatable field set and
   *  bumps its usageCount. */
  instantiate: (args: { data: { id: number } }) => Promise<TFields>;
  /** Discipline the form is currently set to; drives the sort. May be "". */
  currentDiscipline: string;
  /** Called with the templatable field subset. The caller folds it into
   *  the form's draft via setForm/update. */
  onSelect: (fields: TFields) => void;
  noun: "CVR" | "FCO";
}) {
  const { data: items = [] } = useQuery(pickerQueryOptions());
  const [busy, setBusy] = React.useState(false);
  // Tracks the chosen template so the dropdown keeps showing it as selected
  // after instantiation (it pre-fills the form, but the user should still see
  // which template they started from). "" = none chosen yet.
  const [selectedId, setSelectedId] = React.useState("");

  const sorted = React.useMemo(() => {
    if (currentDiscipline === "") return items;
    // Stable partition: discipline-match → any-discipline → others. Server
    // ordering (usageCount desc) is preserved within each partition.
    const match: PickerItem[] = [];
    const any: PickerItem[] = [];
    const other: PickerItem[] = [];
    for (const t of items) {
      if (t.discipline === currentDiscipline) match.push(t);
      else if (t.discipline === "") any.push(t);
      else other.push(t);
    }
    return [...match, ...any, ...other];
  }, [items, currentDiscipline]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2">
      <label className="block">
        <span className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-violet-900">
          <Sparkles className="size-3.5" />
          Start from template
        </span>
        <NativeSelect
          value={selectedId}
          onChange={async (v) => {
            if (busy) return;
            if (v === "") {
              setSelectedId("");
              return;
            }
            const id = Number(v);
            if (!Number.isFinite(id)) return;
            // Reflect the choice immediately so the dropdown shows it while the
            // instantiate fetch is in flight.
            setSelectedId(v);
            setBusy(true);
            try {
              const fields = await instantiate({ data: { id } });
              onSelect(fields);
            } finally {
              setBusy(false);
            }
          }}
          options={[
            { value: "", label: "— Choose a template —" },
            ...sorted.map((t) => ({
              value: String(t.id),
              label: t.templateDescription
                ? `${t.name} — ${t.templateDescription.slice(0, 60)}`
                : t.name,
            })),
          ]}
        />
        <span className="mt-1 block text-[10px] text-violet-700/70">
          Pre-populates fields below. You can still edit before saving the{" "}
          {noun}.
        </span>
      </label>
    </div>
  );
}
