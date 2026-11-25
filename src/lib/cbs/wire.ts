/**
 * The catalog, packed for the wire.
 *
 * A server function wraps every value it returns in a node of its own, which
 * made the ~13,000 catalog rows 7.7 MB of JSON, most of it column names and
 * the same few hundred strings over and over. Packed, it is one string
 * of about 1 MB: a column at a time, each repeated text once, and the yes / no
 * flags folded into a number. Nothing is dropped — unpacking gives back
 * exactly the rows that went in.
 */

const TEXTS = [
  "displayCode",
  "name",
  "uom",
  "accountDescription",
  "status",
  "costClassification",
  "materialType",
  "discipline",
] as const;

const FLAGS = [
  "subReporting",
  "materialCode",
  "laborCode",
  "equipmentCode",
  "otherCode",
  "rentalCode",
  "isOriginal",
] as const;

type TextField = (typeof TEXTS)[number];
type FlagField = (typeof FLAGS)[number];
/** The columns that are never null; the other texts may be. */
type RequiredText = "displayCode" | "name" | "uom" | "accountDescription";

/**
 * A catalog row. Written out so that adding a column to the tree's select
 * without adding it here fails to compile (see `cbsCatalogQueryOptions`),
 * rather than quietly going missing in the browser.
 */
export type CbsPackableRow = { id: number } & Record<RequiredText, string> &
  Record<Exclude<TextField, RequiredText>, string | null> &
  Record<FlagField, boolean | null>;

type PackedCatalog = {
  ids: number[];
  /** Two bits per flag, in `FLAGS` order: 0 null, 1 true, 2 false. */
  flags: number[];
  /**
   * Per text column: its distinct values, and each row's index into them. A
   * column that hardly repeats has no `at`: its values are one per row, since
   * an index would only add to it.
   */
  texts: { values: (string | null)[]; at?: number[] }[];
};

export function packCbsRows(rows: readonly CbsPackableRow[]): string {
  const packed: PackedCatalog = {
    ids: rows.map((r) => r.id),
    flags: rows.map((r) =>
      FLAGS.reduce((bits, f, i) => {
        const v = r[f];
        return bits | ((v === null ? 0 : v ? 1 : 2) << (2 * i));
      }, 0),
    ),
    texts: TEXTS.map((f) => {
      const index = new Map<string | null, number>();
      const at = rows.map((r) => {
        const v = r[f];
        let i = index.get(v);
        if (i === undefined) index.set(v, (i = index.size));
        return i;
      });
      return index.size > rows.length / 2
        ? { values: rows.map((r) => r[f]) }
        : { values: [...index.keys()], at };
    }),
  };
  return JSON.stringify(packed);
}

export function unpackCbsRows(text: string): CbsPackableRow[] {
  const { ids, flags, texts } = JSON.parse(text) as PackedCatalog;
  return ids.map((id, r) => {
    const row: Record<string, unknown> = { id };
    TEXTS.forEach((f, c) => {
      const { values, at } = texts[c];
      row[f] = values[at ? at[r] : r];
    });
    FLAGS.forEach((f, i) => {
      const bits = (flags[r] >> (2 * i)) & 3;
      row[f] = bits === 0 ? null : bits === 1;
    });
    return row as CbsPackableRow;
  });
}
