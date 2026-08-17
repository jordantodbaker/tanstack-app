/**
 * Copy just `keys` from `src` into a new object — a type-safe subset selection.
 * Lets a payload / DTO be derived from a single field-name list instead of
 * hand-listing every field at each call site (e.g. the template modules build
 * their DB payloads and field sets from `*_TEMPLATE_FIELDS`).
 */
export function pickFields<T extends object, K extends keyof T>(
  src: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = src[key];
  return out;
}
