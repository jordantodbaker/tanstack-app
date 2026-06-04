import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  ADMIN_ENTITIES,
  invalidateAdminEntity,
  type AdminEntity,
} from "./admin-invalidations";

/**
 * Independent witness list of every admin entity. Hand-maintained: if a new
 * entity is added to FAN_OUT in the source, this list must be updated too,
 * and the drift-guard test below makes that requirement explicit.
 */
const EXPECTED_ENTITIES: AdminEntity[] = [
  "projects",
  "subcontractors",
  "areas",
  "users",
  "roles",
  "crewMixes",
  "cvrTemplates",
  "fcoTemplates",
];

/**
 * Second witness of which cache keys each entity's mutations should bust.
 * Keeping this in the test (separate from FAN_OUT in the source) means
 * adding/changing a fan-out requires a deliberate test update.
 */
const EXPECTED_FAN_OUT: Record<AdminEntity, string[]> = {
  projects: [
    "projects",
    "subcontractors",
    "areas",
    "areasByProject",
    "adminUsers",
  ],
  subcontractors: ["subcontractors", "projects"],
  areas: ["areas", "areasByProject", "projects"],
  users: ["adminUsers", "projects"],
  roles: ["rolesAdmin", "roleData"],
  crewMixes: ["crewMixesAdmin", "crewMixData"],
  cvrTemplates: ["cvrTemplatesAdmin", "cvrTemplatePicker"],
  fcoTemplates: ["fcoTemplatesAdmin", "fcoTemplatePicker"],
};

/**
 * Calls `invalidateAdminEntity` and returns the first key of each
 * `invalidateQueries` call — that's the cache key being busted.
 */
function capturedKeys(entity: AdminEntity): string[] {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  invalidateAdminEntity(qc, entity);
  return spy.mock.calls.map((args) => {
    const arg = args[0] as { queryKey: readonly unknown[] };
    return String(arg.queryKey[0]);
  });
}

describe("invalidateAdminEntity", () => {
  it("drift guard: the entity set in the test matches the source", () => {
    // If this fails, FAN_OUT in admin-invalidations.ts gained or lost an
    // entry. Update EXPECTED_ENTITIES (and EXPECTED_FAN_OUT) to match.
    expect([...ADMIN_ENTITIES].sort()).toEqual([...EXPECTED_ENTITIES].sort());
  });

  it("fans out to the expected cache keys for each entity", () => {
    for (const entity of EXPECTED_ENTITIES) {
      expect(capturedKeys(entity).sort()).toEqual(
        [...EXPECTED_FAN_OUT[entity]].sort(),
      );
    }
  });

  it("never invalidates unrelated caches", () => {
    // No admin entity's fan-out should touch the per-session currentUser
    // cache — that would force a re-resolve of the signed-in user on every
    // routine admin mutation.
    for (const entity of EXPECTED_ENTITIES) {
      expect(capturedKeys(entity)).not.toContain("currentUser");
    }
  });
});
