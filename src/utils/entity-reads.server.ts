import { requireProjectAccess } from "./users.server";

/**
 * Shared read-path bodies for the change-pipeline entities (CVR/FCO/RFI/Trend/
 * PCO). Each entity keeps its own top-level `createServerFn(...)` declarations
 * (TanStack Start extracts those at module scope), but their handlers delegate
 * here so the access-check + `findMany`/`findUniqueOrThrow` + `rows.map(...)`
 * plumbing lives in one place.
 *
 * The Prisma delegate is typed structurally with `any` so a single helper works
 * across every model without fighting Prisma's per-`select` return narrowing.
 * That `any` is confined to this boundary file — every call site stays fully
 * typed through the `T` mapper generic and the handler's declared return type.
 */
// `(...args: any[]) => any` is the one shape every Prisma model delegate's
// (generic, overloaded) `findMany` / `findUniqueOrThrow` is assignable to — a
// precise structural type fights Prisma's per-call narrowing. The looseness is
// sealed inside this file; call sites stay typed via the `T` mapper generic.
/* eslint-disable @typescript-eslint/no-explicit-any */
type ReadDelegate = {
  findMany: (...args: any[]) => any;
  findUniqueOrThrow: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Project-scoped list read (slim or full). Authorizes against the requested
 * project, then runs `findMany` with the entity's `select` OR `include` and
 * maps each row. Pass exactly one of `select` / `include`, matching Prisma.
 */
export async function fetchProjectScopedList<T>(
  delegate: ReadDelegate,
  projectId: number,
  opts: {
    select?: object;
    include?: object;
    orderBy: object | object[];
    map: (row: never) => T;
  },
): Promise<T[]> {
  await requireProjectAccess(projectId);
  const rows = await delegate.findMany({
    where: { projectId },
    ...(opts.select ? { select: opts.select } : {}),
    ...(opts.include ? { include: opts.include } : {}),
    orderBy: opts.orderBy,
  });
  return (rows as never[]).map(opts.map);
}

/**
 * Single-record read by id. Fetches first (so we can read the row's own
 * `projectId`), then authorizes — mirrors the existing per-entity `fetchX`
 * handlers where the caller knows the id but not the project.
 */
export async function fetchRecordById<T>(
  delegate: ReadDelegate,
  id: number,
  opts: { include?: object; map: (row: never) => T },
): Promise<T> {
  const row = await delegate.findUniqueOrThrow({
    where: { id },
    ...(opts.include ? { include: opts.include } : {}),
  });
  await requireProjectAccess(row.projectId);
  return opts.map(row as never);
}
