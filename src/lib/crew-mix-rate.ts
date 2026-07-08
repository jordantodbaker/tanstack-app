/** A role's rate at a given schedule — the take-off's `roleRates` row shape. */
export type RoleRateRow = { roleName: string; schedule: string; rate: number };

/** A crew-mix member: a role plus how many of them are in the crew. */
export type CrewMixMemberRate = { roleName: string; count: number };

/**
 * Head-count-weighted average of a crew mix's member-role rates at `schedule`:
 * `sum(rate × count) / sum(count)` over the members that resolve to a rate.
 * Members whose role has no rate at that schedule are excluded entirely (from
 * both the weighted sum and the divisor), as are non-positive counts. Returns 0
 * when the schedule is empty or nothing resolves. Single source of truth for a
 * crew mix's labor rate — used by the admin preview, the take-off cell, and the
 * paste path (kept server-import-free so every one of those can import it).
 */
export function crewMixAverageRate(
  members: CrewMixMemberRate[],
  schedule: string,
  roleRates: RoleRateRow[],
): number {
  if (schedule === "") return 0;
  let weighted = 0;
  let headcount = 0;
  for (const m of members) {
    if (!(m.count > 0)) continue;
    const rate = roleRates.find(
      (r) => r.roleName === m.roleName && r.schedule === schedule,
    )?.rate;
    if (typeof rate === "number" && Number.isFinite(rate)) {
      weighted += rate * m.count;
      headcount += m.count;
    }
  }
  return headcount === 0 ? 0 : weighted / headcount;
}
