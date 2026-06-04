import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  assertProjectAccess,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import { hasAtLeastRole } from "./users";
import {
  accumulateProjectTotals,
  type ProjectFefRowTotals,
  type ProjectTotalsRow,
} from "~/lib/project-totals";
import { z } from "zod";
import {
  ProjectId,
  parseIdInput,
  parseIdScalar,
  parseProjectIdInput,
} from "~/lib/validators";

const CreateSnapshotSchema = z.object({
  projectId: ProjectId,
  label: z.string().trim().min(1),
  notes: z.string().optional(),
});

/**
 * Same select-shape as `fetchProjectFefRowTotals` — the snapshot stores
 * exactly the columns `accumulateProjectTotals` consumes, so the same
 * aggregator runs over either live rows or frozen ones with no shape
 * translation.
 */
const SNAPSHOT_ROW_SELECT = {
  discipline: true,
  section: true,
  cbsCode: true,
  area: true,
  name: true,
  description: true,
  shopField: true,
  weldGroupDescription: true,
  quantity: true,
  size: true,
  unit: true,
  metallurgyCode: true,
  boreSize: true,
  role: true,
  schedule: true,
  taskCode: true,
  laborHours: true,
  laborRate: true,
  materialCost: true,
  equipment: true,
  notes: true,
  sub: true,
} as const;

/** Standard JSON value — tighter than `unknown` so TanStack Start's
 *  server-function serializer accepts it. Matches Prisma's `JsonValue`. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EstimateSnapshotBasis = {
  estimateFactor: string;
  compositeLaborRate: string;
  milestones: JsonValue;
};

/** List-view shape, served from `fetchSnapshots`. */
export type EstimateSnapshotItem = {
  id: number;
  label: string;
  notes: string;
  rowCount: number;
  /** Resolved actor email; null when the creator was deleted or never recorded. */
  createdByEmail: string | null;
  createdAt: string;
};

/** Detail-view shape with recomputed totals, served from `fetchSnapshotDetail`. */
export type EstimateSnapshotDetail = {
  id: number;
  projectId: number;
  label: string;
  notes: string;
  rowCount: number;
  basisInputs: EstimateSnapshotBasis | null;
  totals: ProjectFefRowTotals;
  createdByEmail: string | null;
  createdAt: string;
};

export const createSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateSnapshotSchema.parse(input))
  .handler(async ({ data }): Promise<EstimateSnapshotItem> => {
    const actor = await requireProjectAccess(data.projectId);
    const label = data.label.trim();
    if (!label) {
      throw new Error("Snapshot label is required.");
    }
    const [rows, basis] = await Promise.all([
      prisma.fefRow.findMany({
        where: { projectId: data.projectId },
        select: SNAPSHOT_ROW_SELECT,
      }),
      prisma.basisInputs.findUnique({
        where: { projectId: data.projectId },
        select: {
          estimateFactor: true,
          compositeLaborRate: true,
          milestones: true,
        },
      }),
    ]);
    // Pre-compute totals so read paths can skip parsing the heavy `fefRows`
    // blob and re-running the aggregator. Safe to cache because snapshots
    // are immutable — there's no edit surface that could invalidate this.
    const totals = accumulateProjectTotals(rows as ProjectTotalsRow[]);
    const created = await prisma.estimateSnapshot.create({
      data: {
        projectId: data.projectId,
        label,
        notes: data.notes?.trim() ?? "",
        // Prisma's Json column accepts any JSON-serializable value; the cast
        // narrows it past `JsonValue`. Read paths re-assert via the typed
        // alias below — keep both sides in sync if SNAPSHOT_ROW_SELECT moves.
        fefRows: rows as unknown as object,
        basisInputs: (basis as unknown as object) ?? undefined,
        totals: totals as unknown as object,
        rowCount: rows.length,
        createdById: actor.id,
      },
    });
    return {
      id: created.id,
      label: created.label,
      notes: created.notes,
      rowCount: created.rowCount,
      createdByEmail: actor.email,
      createdAt: created.createdAt.toISOString(),
    };
  });

export const fetchSnapshots = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(async ({ data: projectId }): Promise<EstimateSnapshotItem[]> => {
    await requireProjectAccess(projectId);
    const snaps = await prisma.estimateSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        notes: true,
        rowCount: true,
        createdById: true,
        createdAt: true,
      },
    });
    // Resolve creator emails in one query. `createdById` is a plain int with
    // no FK so a deleted user shows up as null in the list, mirroring the
    // audit/notifications convention.
    const userIds = Array.from(
      new Set(
        snaps
          .map((s) => s.createdById)
          .filter((id): id is number => id !== null),
      ),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    return snaps.map((s) => ({
      id: s.id,
      label: s.label,
      notes: s.notes,
      rowCount: s.rowCount,
      createdByEmail:
        s.createdById !== null ? (emailById.get(s.createdById) ?? null) : null,
      createdAt: s.createdAt.toISOString(),
    }));
  });

export const fetchSnapshotDetail = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(async ({ data: id }): Promise<EstimateSnapshotDetail> => {
    // Don't pull `fefRows` here — totals are cached on the row at create
    // time, so the heavy JSON blob is only needed for the legacy-snapshot
    // fallback below (snapshots created before the cache column existed).
    const snap = await prisma.estimateSnapshot.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        projectId: true,
        label: true,
        notes: true,
        rowCount: true,
        basisInputs: true,
        totals: true,
        createdById: true,
        createdAt: true,
      },
    });
    await requireProjectAccess(snap.projectId);
    let totals: ProjectFefRowTotals;
    if (snap.totals !== null) {
      totals = snap.totals as unknown as ProjectFefRowTotals;
    } else {
      // Legacy fallback: pre-cache snapshots have no `totals` column value.
      // Pull `fefRows` and recompute. New snapshots never hit this path.
      const legacy = await prisma.estimateSnapshot.findUniqueOrThrow({
        where: { id },
        select: { fefRows: true },
      });
      const rows = (legacy.fefRows as unknown as ProjectTotalsRow[]) ?? [];
      totals = accumulateProjectTotals(rows);
    }
    const creator =
      snap.createdById !== null
        ? await prisma.user.findUnique({
            where: { id: snap.createdById },
            select: { email: true },
          })
        : null;
    return {
      id: snap.id,
      projectId: snap.projectId,
      label: snap.label,
      notes: snap.notes,
      rowCount: snap.rowCount,
      basisInputs:
        (snap.basisInputs as unknown as EstimateSnapshotBasis | null) ?? null,
      totals,
      createdByEmail: creator?.email ?? null,
      createdAt: snap.createdAt.toISOString(),
    };
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    const snap = await prisma.estimateSnapshot.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true, createdById: true },
    });
    await assertProjectAccess(actor, snap.projectId);
    // Only the creator or an administrator can delete. Project access is
    // enough to view a snapshot but not to remove someone else's.
    const isAdmin = hasAtLeastRole(actor.role, "ADMINISTRATOR");
    const isCreator =
      snap.createdById !== null && snap.createdById === actor.id;
    if (!isAdmin && !isCreator) {
      throw new Error(
        "Only the snapshot creator or an administrator can delete this snapshot.",
      );
    }
    await prisma.estimateSnapshot.delete({ where: { id: data.id } });
    return { ok: true };
  });

export const snapshotsQueryOptions = (projectId: number | null) =>
  queryOptions({
    queryKey: ["snapshots", projectId],
    queryFn: (): Promise<EstimateSnapshotItem[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchSnapshots({ data: projectId }),
    enabled: projectId !== null,
  });

export const snapshotDetailQueryOptions = (id: number | null) =>
  queryOptions({
    queryKey: ["snapshot", id],
    queryFn: (): Promise<EstimateSnapshotDetail | null> =>
      id === null ? Promise.resolve(null) : fetchSnapshotDetail({ data: id }),
    enabled: id !== null,
    // Snapshots are immutable — no need to refetch on focus/interval.
    staleTime: Infinity,
  });
