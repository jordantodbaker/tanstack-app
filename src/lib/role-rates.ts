/**
 * Labor-rate resolution across the three scopes an estimate can price at.
 *
 * A rate is looked up by `(roleName, schedule)`. Three books can supply it and
 * the innermost wins:
 *
 *   version override  →  project override  →  global rate book
 *
 * The scoped books are SPARSE: a project that renegotiated two crafts stores
 * two rows, and everything else falls through to global. That is what makes an
 * override cheap to express. A *frozen* version is the same mechanism used
 * exhaustively — the freeze action materializes the full effective book as
 * version rows, so nothing is left falling through to a global rate that might
 * change later.
 *
 * This module is pure and client-safe; the DB reads live in `utils/roles.ts`.
 */

export type RoleRate = {
  roleName: string;
  schedule: string;
  rate: number;
};

/** Which book a resolved rate came from. Drives the "overridden" UI hints. */
export type RateSource = "version" | "project" | "global";

export type ResolvedRoleRate = RoleRate & { source: RateSource };

/**
 * Composite lookup key. Both halves are user-entered names ("Lead
 * Pipefitter", "ST 4x10"), so no separator character is guaranteed absent
 * from them — joining on one would let ("Lead", "Pipefitter ST") collide
 * with ("Lead Pipefitter", "ST"). JSON encoding is unambiguous for any
 * input, and unlike a NUL separator it stays visible in the source.
 */
function key(roleName: string, schedule: string): string {
  return JSON.stringify([roleName, schedule]);
}

/**
 * Merge the three books into the effective rate list.
 *
 * Every `(role, schedule)` present in ANY book appears exactly once in the
 * result, carrying the winning rate. A scoped override for a pair the global
 * book has never heard of is kept rather than dropped — a project can price a
 * craft the global book doesn't carry.
 *
 * Ordering is stable: global order first (so the admin-controlled role/schedule
 * ordering is preserved), then any scoped-only pairs in project-then-version
 * order. Callers render this directly, so a stable order matters.
 */
/**
 * The precedence rule itself, factored out so every scope-aware path shares
 * one implementation. Layers are given least-specific first; a later layer
 * overrides any key an earlier one supplied.
 *
 * Ordering is stable: keys appear in the order the FIRST layer to carry them
 * introduced them. That keeps the admin-controlled role/schedule ordering
 * intact — an override changes a rate, never the position of a dropdown row.
 */
function mergeByPrecedence<T>(
  layers: readonly (readonly T[])[],
  keyOf: (item: T) => string,
): { item: T; layer: number }[] {
  const winner = new Map<string, { item: T; layer: number }>();
  const order: string[] = [];
  layers.forEach((layer, index) => {
    for (const item of layer) {
      const k = keyOf(item);
      if (!winner.has(k)) order.push(k);
      winner.set(k, { item, layer: index });
    }
  });
  return order.map((k) => winner.get(k)!);
}

/**
 * Merge the three books into the effective rate list.
 *
 * Every `(role, schedule)` present in ANY book appears exactly once in the
 * result, carrying the winning rate. A scoped override for a pair the global
 * book has never heard of is kept rather than dropped — a project can price a
 * craft the global book doesn't carry.
 */
export function resolveRoleRates(input: {
  global: readonly RoleRate[];
  project?: readonly RoleRate[];
  version?: readonly RoleRate[];
}): ResolvedRoleRate[] {
  const sources: RateSource[] = ["global", "project", "version"];
  return mergeByPrecedence(
    [input.global, input.project ?? [], input.version ?? []],
    (r) => key(r.roleName, r.schedule),
  ).map(({ item, layer }) => ({ ...item, source: sources[layer] }));
}

/** A rate row identified by role id — the shape the scoped tables store. */
export type RoleIdRate = { roleId: number; schedule: string; rate: number };

/**
 * Same precedence rule, keyed by `roleId` instead of role name.
 *
 * The freeze action works in ids: it reads rate rows and writes rate rows,
 * never seeing a role name. Sharing `mergeByPrecedence` with the name-keyed
 * path is the point — freezing must materialize EXACTLY what the grid would
 * have resolved, and two copies of the precedence rule would eventually
 * disagree.
 *
 * Pass only the layers that apply: freezing a version resolves global +
 * project, freezing a project resolves global alone.
 */
export function resolveRoleIdRates(
  ...layers: readonly (readonly RoleIdRate[])[]
): RoleIdRate[] {
  return mergeByPrecedence(layers, (r) =>
    JSON.stringify([r.roleId, r.schedule]),
  ).map(({ item }) => item);
}

/**
 * The effective rate for one `(role, schedule)`, or `undefined` when no book
 * carries it. Convenience over `resolveRoleRates` for single lookups — the
 * grid resolves whole books, but the freeze action checks pairs.
 */
export function effectiveRate(
  resolved: readonly ResolvedRoleRate[],
  roleName: string,
  schedule: string,
): ResolvedRoleRate | undefined {
  return resolved.find(
    (r) => r.roleName === roleName && r.schedule === schedule,
  );
}

/**
 * Strip the `source` tag, leaving the shape the grid's `roleRates` meta and
 * `crewMixAverageRate` already consume. Keeping the tagged and untagged forms
 * separate means nothing downstream had to change to gain scoped rates.
 */
export function toPlainRates(
  resolved: readonly ResolvedRoleRate[],
): RoleRate[] {
  return resolved.map(({ roleName, schedule, rate }) => ({
    roleName,
    schedule,
    rate,
  }));
}
