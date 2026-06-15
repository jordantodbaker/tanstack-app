/**
 * Single source of truth for every React Query key used in the app.
 *
 * Why this exists: keys were previously inlined as raw arrays at every
 * `queryOptions(…)` and `invalidateQueries(…)` callsite. That let typos slip
 * through — e.g. routes invalidating `["changelog", projectId]` (lowercase)
 * while the actual key emitted by `changelog.ts` is `["changeLog", projectId]`
 * (camelCase), silently breaking cross-entity cache busts on PCO/Trend
 * promotions. Centralising keys here makes the typo a TypeScript error.
 *
 * Each entry returns a `readonly` tuple so TanStack Query's prefix matching
 * stays predictable. Don't add untyped string keys here — if you need a new
 * key, give it a proper function.
 */

/**
 * The four list/full/single/singleAll keys every change-pipeline entity
 * (CVR / FCO / RFI / Trend / PCO) shares. Generic over a literal `entity`
 * string so each entity's `qk.<entity>.single(id)` keeps the precise tuple
 * type `readonly ["fcoLog", "single", number | null]` (and so on) — narrower
 * than `readonly [string, "single", number | null]`, which `useQuery` and
 * `invalidateQueries` callers rely on for type-safe key matching.
 *
 * Per-entity extras (CVR's `cvrOptions`, PCO's `eligibleCvrs`) are spread
 * alongside this at the callsite.
 */
function entityKeys<const E extends string>(entity: E) {
  return {
    list: (projectId: number | null) => [entity, projectId] as const,
    full: (projectId: number | null) => [entity, "full", projectId] as const,
    single: (id: number | null) => [entity, "single", id] as const,
    /** Prefix match — busts every cached single-record entry regardless of id.
     *  Used after a mutation so a reopened dialog refetches the fresh record
     *  instead of serving a stale cache. */
    singleAll: () => [entity, "single"] as const,
  };
}

export const qk = {
  changeLog: {
    ...entityKeys("changeLog"),
    /** CVR-picker dropdown used by the FCO dialog's "link existing CVR". */
    cvrOptions: (projectId: number | null) =>
      ["cvrOptions", projectId] as const,
  },
  fcoLog: entityKeys("fcoLog"),
  rfis: entityKeys("rfis"),
  trends: entityKeys("trends"),
  pcos: {
    ...entityKeys("pcos"),
    eligibleCvrs: (
      projectId: number | null,
      currentPcoId: number | null,
    ) => ["pcos", "eligibleCvrs", projectId, currentPcoId] as const,
  },
  dashboardSummary: (projectId: number | null) =>
    ["dashboardSummary", projectId] as const,
  /** Cross-entity command-palette search, keyed by project + query string. */
  search: (projectId: number | null, query: string) =>
    ["search", projectId, query] as const,
  projectFefRowTotals: (projectId: number | null) =>
    ["projectFefRowTotals", projectId] as const,
  invalidByDiscipline: (projectId: number | null) =>
    ["invalidByDiscipline", projectId] as const,
  reporting: {
    periods: (projectId: number | null) =>
      ["reportingPeriods", projectId] as const,
    /** Prefix match — busts every cached period regardless of periodId. */
    periodWithEvmAll: () => ["periodWithEvm"] as const,
    periodWithEvm: (periodId: number | null) =>
      ["periodWithEvm", periodId] as const,
    latestPeriodWithEvm: (projectId: number | null) =>
      ["latestPeriodWithEvm", projectId] as const,
    evmTimeSeries: (projectId: number | null) =>
      ["evmTimeSeries", projectId] as const,
  },
} as const;
