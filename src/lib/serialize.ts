/**
 * Serialize a nullable `Date` to an ISO 8601 string (or null) for client
 * transport. Every entity's row→DTO mapper needs the same null-safe conversion,
 * so it lives here instead of being copy-pasted per module.
 */
export const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();

/** Keys of `T` whose value is a non-null `Date`. */
type IsoDateKeys<T> = {
  [K in keyof T]-?: [T[K]] extends [Date] ? K : never;
}[keyof T];

/** Keys of `T` whose value is `Date | null`. */
type NullableDateKeys<T> = {
  [K in keyof T]-?: [null] extends [T[K]]
    ? [Exclude<T[K], null>] extends [Date]
      ? K
      : never
    : never;
}[keyof T];

/**
 * Serialize a row's `Date` columns for client transport, returning a spreadable
 * patch: each `iso` field becomes a `string` (via `toISOString`), each
 * `nullable` field a `string | null` (via `serializeDate`). Row→DTO mappers
 * spread this over `...row` so the repeated `foo: r.foo.toISOString()` /
 * `bar: serializeDate(r.bar)` block lives in one place.
 *
 * The field lists are constrained to the row's actual `Date` / `Date | null`
 * columns, so a misspelled or wrong-typed field name is a compile error — the
 * whole point being that you can't accidentally call `toISOString()` on a
 * non-Date at runtime.
 */
export function serializeDateFields<
  T,
  Iso extends IsoDateKeys<T>,
  Nullable extends NullableDateKeys<T>,
>(
  row: T,
  fields: { iso: readonly Iso[]; nullable: readonly Nullable[] },
): { [K in Iso]: string } & { [K in Nullable]: string | null } {
  const out: Record<string, string | null> = {};
  for (const key of fields.iso) {
    out[key as string] = (row[key as keyof T] as Date).toISOString();
  }
  for (const key of fields.nullable) {
    out[key as string] = serializeDate(row[key as keyof T] as Date | null);
  }
  return out as { [K in Iso]: string } & { [K in Nullable]: string | null };
}
