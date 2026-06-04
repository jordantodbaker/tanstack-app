import type { QueryClient } from "@tanstack/react-query";

/**
 * Single source of truth for which React Query caches each admin entity's
 * mutations should bust. A save on Projects, for example, can change which
 * subs and areas are attached to a project, so the Subcontractors and Areas
 * admin pages must be invalidated as well to stay in sync.
 *
 * Keep the first entry of each array equal to the entity's own cache key —
 * order is meaningful for readability, not behavior.
 */
const FAN_OUT = {
  // Projects save can change attached subs, areas, and user assignments.
  projects: ["projects", "subcontractors", "areas", "areasByProject", "adminUsers"],
  subcontractors: ["subcontractors", "projects"],
  // `areasByProject` is the per-project dropdown list; it's a separate cache
  // key from `areas` (the admin list), so admin add/edit/delete has to bust
  // both. Without this entry, a freshly added area wouldn't show in any
  // Take Off / dialog dropdown until a hard refresh.
  areas: ["areas", "areasByProject", "projects"],
  // User save can change project assignments — bust the projects list too
  // because non-admins' visible-project set may change.
  users: ["adminUsers", "projects"],
  // Role save changes which roles appear in each discipline's Take Off
  // dropdown — bust every `roleData` cache (any disciplineId arg) as well
  // as the admin list itself.
  roles: ["rolesAdmin", "roleData"],
  // Crew mix save changes which mixes appear in the Take Off "Use Crew Mix"
  // dropdown — bust the shared `crewMixData` cache used by every discipline
  // alongside the admin list.
  crewMixes: ["crewMixesAdmin", "crewMixData"],
  // CVR template save changes the picker payload the Change Log dialog
  // reads — bust both the admin list and the slim picker cache. Same
  // shape for FCO templates below.
  cvrTemplates: ["cvrTemplatesAdmin", "cvrTemplatePicker"],
  fcoTemplates: ["fcoTemplatesAdmin", "fcoTemplatePicker"],
} as const;

export type AdminEntity = keyof typeof FAN_OUT;

/**
 * Runtime list of every registered admin entity. Exported so tests can
 * assert their hand-maintained list stays in sync with the source.
 */
export const ADMIN_ENTITIES = Object.keys(FAN_OUT) as AdminEntity[];

/** Invalidate every cache affected by a mutation on `entity`. */
export function invalidateAdminEntity(
  queryClient: QueryClient,
  entity: AdminEntity,
): void {
  for (const key of FAN_OUT[entity]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
