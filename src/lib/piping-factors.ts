/**
 * Packing and unpacking the piping factor catalog.
 *
 * The catalog is a static lookup the grid consults on every keystroke that
 * changes a task code or size, so it has to live in memory on the client — the
 * derivation cannot take a network hop. What it does not have to be is large.
 *
 * The database returns ~7,400 factor values, of which the client historically
 * kept ~4,500: it dropped every null and every repeat of a (code, size) it had
 * already seen. That discarding happened AFTER transport, so 39% of the payload
 * existed only to be thrown away. `packPipingFactors` performs the identical
 * reduction on the server and emits the survivors in a flat form.
 *
 * The two functions are deliberately a matched pair, and
 * `piping-factors.test.ts` pins that `unpack(pack(rows))` equals what the old
 * client-side loop built from the same rows — the property that makes this a
 * transport change and not a pricing change.
 */

/** A factor row as read from the database, before packing. */
export type RawPipingFactor = {
  code: string;
  unit: string;
  taskDefinition: string;
  values: { size: number; value: number | null }[];
};

/** One code's curve, packed for the wire. */
export type PackedPipingFactor = {
  code: string;
  unit: string;
  /** Flat `[size, value, size, value, …]`. Always even length, never null. */
  sv: number[];
};

export type PipingFactorData = {
  taskCodeOptions: { code: string; taskDefinition: string }[];
  pipingFactors: PackedPipingFactor[];
};

/** The in-memory shape the grid reads. */
export type PipingFactorLookup = Map<
  string,
  { unit: string; values: Map<number, number> }
>;

/**
 * Reduce raw factor rows to one entry per code.
 *
 * First-wins throughout, matching what the client used to do: the first row
 * carrying a code fixes that code's `unit` and `taskDefinition`, and the first
 * non-null value for a given size wins. Callers must pass rows in a stable
 * order — the caller in `utils/piping.ts` orders by `(code, id)` — or which of
 * two rows sharing a code wins is arbitrary.
 *
 * NOTE: keying on `code` alone is not correct in general. `FBWXXH` exists as
 * two rows (Sch 5 and XXH) whose factors differ by up to 3.7x, and this keeps
 * whichever sorts first. That is preserved here on purpose: it is the behavior
 * the client already had, and fixing the key is a separate change.
 */
export function packPipingFactors(rows: readonly RawPipingFactor[]): PipingFactorData {
  const taskCodeMap = new Map<string, string>();
  const packed = new Map<string, { unit: string; values: Map<number, number> }>();

  for (const row of rows) {
    if (!taskCodeMap.has(row.code)) taskCodeMap.set(row.code, row.taskDefinition);

    let entry = packed.get(row.code);
    if (!entry) {
      entry = { unit: row.unit, values: new Map<number, number>() };
      packed.set(row.code, entry);
    }
    for (const v of row.values) {
      if (v.value !== null && !entry.values.has(v.size)) {
        entry.values.set(v.size, v.value);
      }
    }
  }

  return {
    taskCodeOptions: Array.from(taskCodeMap, ([code, taskDefinition]) => ({
      code,
      taskDefinition,
    })),
    pipingFactors: Array.from(packed, ([code, entry]) => ({
      code,
      unit: entry.unit,
      sv: Array.from(entry.values, ([size, value]) => [size, value]).flat(),
    })),
  };
}

/** Rebuild the lookup the grid reads. Inverse of `packPipingFactors`. */
export function unpackPipingFactors(
  packed: readonly PackedPipingFactor[] | undefined,
): PipingFactorLookup {
  const m: PipingFactorLookup = new Map();
  for (const factor of packed ?? []) {
    const values = new Map<number, number>();
    // Odd trailing element would mean a malformed payload; stepping by two and
    // bounding on `i + 1` simply ignores it rather than storing `undefined`.
    for (let i = 0; i + 1 < factor.sv.length; i += 2) {
      values.set(factor.sv[i], factor.sv[i + 1]);
    }
    m.set(factor.code, { unit: factor.unit, values });
  }
  return m;
}
