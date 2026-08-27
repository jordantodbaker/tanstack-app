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
    /** Prefix match — every cached `currentPcoId` variant for the project.
     *  A PCO upsert can attach/detach CVRs, changing what is eligible. */
    eligibleCvrsAll: (projectId: number | null) =>
      ["pcos", "eligibleCvrs", projectId] as const,
  },
  dashboardSummary: (projectId: number | null) =>
    ["dashboardSummary", projectId] as const,
  /** Cross-entity command-palette search, keyed by project + query string. */
  search: (projectId: number | null, query: string) =>
    ["search", projectId, query] as const,
  // Keyed by the estimate version (not project) — each version has its own
  // line items, so its totals and invalid-row counts are independent.
  projectFefRowTotals: (versionId: number | null) =>
    ["projectFefRowTotals", versionId] as const,
  invalidByDiscipline: (versionId: number | null) =>
    ["invalidByDiscipline", versionId] as const,
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
    /** Always-on estimate↔change budget reconciliation, keyed by the chosen
     *  baseline snapshot (null = latest / live-estimate fallback). */
    budgetReconciliation: (
      projectId: number | null,
      baselineSnapshotId: number | null,
    ) => ["budgetReconciliation", projectId, baselineSnapshotId] as const,
    /** Prefix match — busts every baseline variant for the project. */
    budgetReconciliationAll: (projectId: number | null) =>
      ["budgetReconciliation", projectId] as const,
  },

  // ── Records attached to a host entity (CVR/FCO/RFI/Trend/PCO) ────────────
  // All three are keyed by the host's (entityType, entityId) pair, so a
  // dialog's three panels each get their own cache entry per record.
  attachments: (entityType: string, entityId: number | null) =>
    ["attachments", entityType, entityId] as const,
  comments: (entityType: string, entityId: number | null) =>
    ["comments", entityType, entityId] as const,
  auditEvents: (entityType: string, entityId: number | null) =>
    ["auditEvents", entityType, entityId] as const,

  // ── Version-scoped estimate data ─────────────────────────────────────────
  fefRows: {
    /** Prefix match — every sheet of every version. Used when switching or
     *  deleting an estimate version, where per-sheet keys aren't enumerable. */
    all: () => ["fefRows"] as const,
    sheet: (
      versionId: number | null,
      discipline: string,
      section: string,
    ) => ["fefRows", versionId, discipline, section] as const,
  },
  /** Prefix match over every version's totals. */
  projectFefRowTotalsAll: () => ["projectFefRowTotals"] as const,
  /** Prefix match over every version's invalid-row counts. */
  invalidByDisciplineAll: () => ["invalidByDiscipline"] as const,
  basisInputs: {
    all: () => ["basisInputs"] as const,
    forVersion: (versionId: number | null) =>
      ["basisInputs", versionId] as const,
  },
  devDocChecklist: (versionId: number | null) =>
    ["devDocChecklist", versionId] as const,
  /** User-defined take-off column definitions for one project+discipline. */
  customFieldDefs: (projectId: number | null, discipline: string) =>
    ["customFieldDefs", projectId, discipline] as const,
  /** Preview of which stored labor rates a refresh would change. Never
   *  cached (see its queryOptions) — an approved plan must describe the
   *  sheet as it is now. */
  rateRefreshPreview: (versionId: number | null) =>
    ["rateRefreshPreview", versionId] as const,

  // ── Estimate versions + snapshots ────────────────────────────────────────
  versions: (projectId: number | null) => ["versions", projectId] as const,
  snapshots: (projectId: number | null) => ["snapshots", projectId] as const,
  snapshot: (id: number | null) => ["snapshot", id] as const,

  // ── CBS catalog ──────────────────────────────────────────────────────────
  cbs: {
    /** Sorted so two callers requesting the same set share one cache entry. */
    codeResolve: (codes: string[]) =>
      ["cbsCodeResolve", [...codes].sort()] as const,
    codeSearch: (query: string) => ["cbsCodeSearch", query] as const,
    itemsByL1: (l1Values: string[]) => ["cbsItemsByL1", l1Values] as const,
    itemsByL1PagedAll: () => ["cbsItemsByL1Paged"] as const,
    itemsByL1Paged: (input: {
      l1Values: string[];
      page: number;
      pageSize: number;
      projectId: number | null;
    }) =>
      [
        "cbsItemsByL1Paged",
        input.l1Values,
        input.page,
        input.pageSize,
        input.projectId,
      ] as const,
    itemsByL1FilteredAll: () => ["cbsItemsByL1Filtered"] as const,
    itemsByL1Filtered: (input: {
      l1Values: string[];
      projectId: number | null;
    }) =>
      ["cbsItemsByL1Filtered", input.l1Values, input.projectId] as const,
  },

  // ── Project setup (which CBS items a project may use) ────────────────────
  setup: {
    cbsItems: () => ["setupCbsItems"] as const,
    allowedFefCbsItemIds: (projectId: number) =>
      ["allowedFefCbsItemIds", projectId] as const,
    allowedCbsL1Codes: (projectId: number) =>
      ["allowedCbsL1Codes", projectId] as const,
  },

  // ── Take-off reference data ──────────────────────────────────────────────
  piping: {
    groups: () => ["pipingGroups"] as const,
    factorData: () => ["pipingFactorData"] as const,
  },
  steelMembers: () => ["steelMembers"] as const,

  // ── Admin entities. The key ROOTS here are what `admin-invalidations`
  //    fans out over, so a rename must be made in both places. ─────────────
  projects: () => ["projects"] as const,
  subcontractors: () => ["subcontractors"] as const,
  areas: {
    /** The admin list — every area across every project. */
    all: () => ["areas"] as const,
    /** The per-project dropdown list. A SEPARATE cache from `all()`: busting
     *  one does not bust the other, which is why area mutations go through
     *  `invalidateAdminEntity` rather than invalidating a single key. */
    byProject: (projectId: number | null) =>
      ["areasByProject", projectId] as const,
  },
  schedules: () => ["schedules"] as const,
  roles: {
    admin: () => ["rolesAdmin"] as const,
    /** Prefix match — every (discipline, project, version) variant. Used
     *  after a rate freeze, which changes what the grid resolves but not
     *  the roles themselves, so the broader admin fan-out is overkill. */
    dataAll: () => ["roleData"] as const,
    /**
     * Per-discipline role + rate data the take-off grid reads, scoped to the
     * project and version so their rate overrides don't share a cache entry.
     * The admin fan-out prefix-matches `["roleData"]`, so a global rate edit
     * still busts every scoped variant.
     */
    data: (
      disciplineId: string | null,
      projectId: number | null = null,
      versionId: number | null = null,
    ) => ["roleData", disciplineId, projectId, versionId] as const,
  },
  crewMixes: {
    admin: () => ["crewMixesAdmin"] as const,
    data: () => ["crewMixData"] as const,
  },
  cvrTemplates: {
    admin: () => ["cvrTemplatesAdmin"] as const,
    picker: () => ["cvrTemplatePicker"] as const,
  },
  fcoTemplates: {
    admin: () => ["fcoTemplatesAdmin"] as const,
    picker: () => ["fcoTemplatePicker"] as const,
  },

  // ── Users, preferences, notifications ────────────────────────────────────
  users: {
    current: () => ["currentUser"] as const,
    admin: () => ["adminUsers"] as const,
  },
  userPrefs: {
    dashboard: () => ["userDashboardPrefs"] as const,
    emailNotification: () => ["emailNotificationPref"] as const,
    recents: () => ["userRecents"] as const,
  },
  notifications: {
    /** Prefix match — covers the list AND the unread count below. */
    all: () => ["notifications"] as const,
    list: () => ["notifications"] as const,
    unreadCount: () => ["notifications", "unreadCount"] as const,
    emailDeliveryConfigured: () => ["emailDeliveryConfigured"] as const,
  },
} as const;
