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
export const qk = {
  changeLog: {
    list: (projectId: number | null) => ["changeLog", projectId] as const,
    full: (projectId: number | null) =>
      ["changeLog", "full", projectId] as const,
    single: (id: number | null) => ["changeLog", "single", id] as const,
    /** CVR-picker dropdown used by the FCO dialog's "link existing CVR". */
    cvrOptions: (projectId: number | null) =>
      ["cvrOptions", projectId] as const,
  },
  fcoLog: {
    list: (projectId: number | null) => ["fcoLog", projectId] as const,
    full: (projectId: number | null) => ["fcoLog", "full", projectId] as const,
    single: (id: number | null) => ["fcoLog", "single", id] as const,
  },
  rfis: {
    list: (projectId: number | null) => ["rfis", projectId] as const,
    full: (projectId: number | null) => ["rfis", "full", projectId] as const,
    single: (id: number | null) => ["rfis", "single", id] as const,
  },
  trends: {
    list: (projectId: number | null) => ["trends", projectId] as const,
    full: (projectId: number | null) => ["trends", "full", projectId] as const,
    single: (id: number | null) => ["trends", "single", id] as const,
  },
  pcos: {
    list: (projectId: number | null) => ["pcos", projectId] as const,
    full: (projectId: number | null) => ["pcos", "full", projectId] as const,
    single: (id: number | null) => ["pcos", "single", id] as const,
    eligibleCvrs: (
      projectId: number | null,
      currentPcoId: number | null,
    ) => ["pcos", "eligibleCvrs", projectId, currentPcoId] as const,
  },
  dashboardSummary: (projectId: number | null) =>
    ["dashboardSummary", projectId] as const,
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
