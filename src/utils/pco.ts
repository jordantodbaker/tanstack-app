import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import { serializeDate } from "~/lib/serialize";
import { invalidateEntityRecordQueries } from "~/lib/invalidate";
import {
  fetchProjectScopedList,
  fetchRecordById,
} from "./entity-reads.server";
import {
  projectScopedListQueryOptions,
  recordQueryOptions,
} from "~/lib/query-options";
import { z } from "zod";
import {
  Id,
  ProjectId,
  parseIdInput,
  parseIdScalar,
  parseProjectIdInput,
  parseTransitionInput,
  parseUpsertPco,
} from "~/lib/validators";
import {
  assertProjectAccess,
  requireProjectAccess,
  resolveCurrentUser,
} from "./users.server";
import {
  diffFields,
  recordCreate,
  recordDelete,
  recordUpdate,
} from "./audit.server";
import { applyWorkflowTransition } from "./workflow.server";
import { PCO_TRANSITIONS } from "./workflow";
import { PCO_STATUS_LABELS } from "./pcoLabels";

/**
 * SERVER-SIDE PCO module. PCOs (Prime / Owner Change Orders) bundle one or
 * more approved CVRs into a billable ask to the project owner. Lifecycle:
 * DRAFT → SUBMITTED → NEGOTIATING → APPROVED → INVOICED → CLOSED, with
 * REJECTED / VOID terminals.
 *
 * One CVR sits in at most one PCO (`ChangeLog.linkedPcoId`); the inverse
 * `linkedCvrs` on `Pco` gives a PCO its CVR list. The dialog links CVRs by
 * mutating `ChangeLog.linkedPcoId` on save — the join is a regular FK, not
 * a join table.
 */

export const PCO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "NEGOTIATING",
  "APPROVED",
  "INVOICED",
  "CLOSED",
  "REJECTED",
  "VOID",
] as const;
export type PcoStatus = (typeof PCO_STATUSES)[number];

export const PCO_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type PcoPriority = (typeof PCO_PRIORITIES)[number];

/** Statuses where the PCO is still in negotiation / pre-billing — drives
 *  the "open PCO" stat card and dashboard count. */
export const PCO_OPEN_STATUSES: PcoStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "NEGOTIATING",
];

/** Statuses where the owner has agreed to the amount but cash hasn't
 *  arrived — what AR is chasing. */
export const PCO_BILLABLE_STATUSES: PcoStatus[] = ["APPROVED", "INVOICED"];

export type PcoLinkedCvrSummary = {
  id: number;
  cvrNumber: string;
  title: string;
  status: string;
  costImpact: number;
};

/**
 * Slim shape used by the list table and dashboard. Drops the three long-text
 * fields (`description`, `reasonNarrative`, `notes`) that only the dialog
 * and CSV export need. The dialog refetches the full record on open via
 * `pcoQueryOptions(id)`.
 */
export type PcoListItem = {
  id: number;
  projectId: number;
  pcoNumber: string;
  ownerReference: string;
  title: string;
  status: PcoStatus;
  priority: PcoPriority;
  requestedAmount: number;
  approvedAmount: number;
  scheduleDaysImpact: number;
  ownerRepName: string;
  ownerRepEmail: string;
  submittedAt: string | null;
  approvedAt: string | null;
  invoicedAt: string | null;
  invoiceNumber: string;
  paidAt: string | null;
  closedAt: string | null;
  initiatedBy: string;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  linkedCvrs: PcoLinkedCvrSummary[];
};

export type PcoItem = PcoListItem & {
  description: string;
  reasonNarrative: string;
  notes: string;
};

type PcoScalarRow = Awaited<ReturnType<typeof prisma.pco.findMany>>[number];
type PcoWithLinks = PcoScalarRow & { linkedCvrs: PcoLinkedCvrSummary[] };

const linkedCvrsInclude = {
  linkedCvrs: {
    select: {
      id: true,
      cvrNumber: true,
      title: true,
      status: true,
      costImpact: true,
    },
  },
} as const;

const toItem = (r: PcoWithLinks): PcoItem => {
  const { linkedCvrs, ...rest } = r;
  return {
    ...rest,
    status: rest.status as PcoStatus,
    priority: rest.priority as PcoPriority,
    submittedAt: serializeDate(rest.submittedAt),
    approvedAt: serializeDate(rest.approvedAt),
    invoicedAt: serializeDate(rest.invoicedAt),
    paidAt: serializeDate(rest.paidAt),
    closedAt: serializeDate(rest.closedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
    linkedCvrs,
  };
};

/**
 * Prisma `select` for the slim list shape — keep in sync with `PcoListItem`.
 */
const LIST_SELECT = {
  id: true,
  projectId: true,
  pcoNumber: true,
  ownerReference: true,
  title: true,
  status: true,
  priority: true,
  requestedAmount: true,
  approvedAmount: true,
  scheduleDaysImpact: true,
  ownerRepName: true,
  ownerRepEmail: true,
  submittedAt: true,
  approvedAt: true,
  invoicedAt: true,
  invoiceNumber: true,
  paidAt: true,
  closedAt: true,
  initiatedBy: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  linkedCvrs: {
    select: {
      id: true,
      cvrNumber: true,
      title: true,
      status: true,
      costImpact: true,
    },
  },
} as const;

type PcoListRow = Awaited<
  ReturnType<typeof prisma.pco.findMany<{ select: typeof LIST_SELECT }>>
>[number];

const toListItem = (r: PcoListRow): PcoListItem => {
  const { linkedCvrs, ...rest } = r;
  return {
    ...rest,
    status: rest.status as PcoStatus,
    priority: rest.priority as PcoPriority,
    submittedAt: serializeDate(rest.submittedAt),
    approvedAt: serializeDate(rest.approvedAt),
    invoicedAt: serializeDate(rest.invoicedAt),
    paidAt: serializeDate(rest.paidAt),
    closedAt: serializeDate(rest.closedAt),
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
    linkedCvrs,
  };
};

export const fetchPcoList = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(({ data }): Promise<PcoListItem[]> =>
    fetchProjectScopedList(prisma.pco, data, {
      select: LIST_SELECT,
      orderBy: [{ createdAt: "desc" }],
      map: toListItem,
    }),
  );

export const pcoListQueryOptions = (projectId: number | null) =>
  projectScopedListQueryOptions(
    qk.pcos.list(projectId),
    projectId,
    fetchPcoList,
  );

/**
 * Full list — every column. Triggered by the CSV export button on click.
 */
export const fetchPcoListFull = createServerFn({ method: "GET" })
  .inputValidator(parseProjectIdInput)
  .handler(({ data }): Promise<PcoItem[]> =>
    fetchProjectScopedList(prisma.pco, data, {
      include: linkedCvrsInclude,
      orderBy: [{ createdAt: "desc" }],
      map: toItem,
    }),
  );

export const pcoListFullQueryOptions = (projectId: number | null) =>
  projectScopedListQueryOptions(
    qk.pcos.full(projectId),
    projectId,
    fetchPcoListFull,
  );

export const fetchPco = createServerFn({ method: "GET" })
  .inputValidator(parseIdScalar)
  .handler(({ data }): Promise<PcoItem> =>
    fetchRecordById(prisma.pco, data, {
      include: linkedCvrsInclude,
      map: toItem,
    }),
  );

export const pcoQueryOptions = (id: number | null) =>
  recordQueryOptions(qk.pcos.single(id), id, fetchPco);

/**
 * CVRs eligible to be attached to a PCO — APPROVED or EXECUTED status,
 * not already linked to a different PCO, scoped to the project. When
 * `currentPcoId` is supplied (edit mode) the already-attached CVRs are
 * also included so they can be unchecked.
 */
export type PcoEligibleCvr = {
  id: number;
  cvrNumber: string;
  title: string;
  status: string;
  costImpact: number;
};

const PcoEligibleCvrsInputSchema = z.object({
  projectId: ProjectId,
  currentPcoId: Id.nullable(),
});
export const fetchPcoEligibleCvrs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => PcoEligibleCvrsInputSchema.parse(input))
  .handler(async ({ data }): Promise<PcoEligibleCvr[]> => {
    await requireProjectAccess(data.projectId);
    const rows = await prisma.changeLog.findMany({
      where: {
        projectId: data.projectId,
        status: { in: ["APPROVED", "EXECUTED"] },
        OR: [
          { linkedPcoId: null },
          ...(data.currentPcoId !== null
            ? [{ linkedPcoId: data.currentPcoId }]
            : []),
        ],
      },
      select: {
        id: true,
        cvrNumber: true,
        title: true,
        status: true,
        costImpact: true,
      },
      orderBy: { requestedAt: "desc" },
    });
    return rows.map((r) => ({ ...r, status: r.status as string }));
  });

export const pcoEligibleCvrsQueryOptions = (
  projectId: number | null,
  currentPcoId: number | null,
) =>
  queryOptions({
    queryKey: qk.pcos.eligibleCvrs(projectId, currentPcoId),
    queryFn: (): Promise<PcoEligibleCvr[]> =>
      projectId === null
        ? Promise.resolve([])
        : fetchPcoEligibleCvrs({
            data: { projectId, currentPcoId },
          }),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
  });

export type UpsertPcoInput = {
  id?: number;
  projectId: number;
  pcoNumber: string;
  ownerReference: string;
  title: string;
  description: string;
  priority: PcoPriority;
  requestedAmount: number;
  approvedAmount: number;
  scheduleDaysImpact: number;
  ownerRepName: string;
  ownerRepEmail: string;
  reasonNarrative: string;
  notes: string;
  invoiceNumber: string;
  initiatedBy: string;
  /** CVR ids the user has selected on the dialog. The server resolves the
   *  diff against current `linkedCvrs` and updates ChangeLog rows. */
  linkedCvrIds: number[];
};

const PCO_AUDIT_FIELDS = [
  "pcoNumber",
  "ownerReference",
  "title",
  "description",
  "status",
  "priority",
  "requestedAmount",
  "approvedAmount",
  "scheduleDaysImpact",
  "ownerRepName",
  "ownerRepEmail",
  "reasonNarrative",
  "notes",
  "submittedAt",
  "approvedAt",
  "invoicedAt",
  "invoiceNumber",
  "paidAt",
  "closedAt",
  "initiatedBy",
] as const satisfies readonly (keyof PcoScalarRow)[];

export const upsertPco = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertPco)
  .handler(async ({ data }): Promise<PcoItem> => {
    const actor = await requireProjectAccess(data.projectId);
    // Validate every requested CVR link belongs to this project AND is in
    // an attachable state. Doing both checks here keeps the upsert handler
    // the single guard against linking foreign-project / non-approved CVRs.
    if (data.linkedCvrIds.length > 0) {
      const cvrs = await prisma.changeLog.findMany({
        where: { id: { in: data.linkedCvrIds } },
        select: {
          id: true,
          projectId: true,
          status: true,
          linkedPcoId: true,
        },
      });
      if (cvrs.length !== data.linkedCvrIds.length) {
        throw new Error("One or more selected CVRs no longer exist.");
      }
      for (const c of cvrs) {
        if (c.projectId !== data.projectId) {
          throw new Error("Cannot attach a CVR from another project.");
        }
        if (c.status !== "APPROVED" && c.status !== "EXECUTED") {
          throw new Error(
            "Only APPROVED or EXECUTED CVRs can be attached to a PCO.",
          );
        }
        if (
          c.linkedPcoId !== null &&
          c.linkedPcoId !== (data.id ?? -1)
        ) {
          throw new Error(
            "One or more selected CVRs are already attached to a different PCO.",
          );
        }
      }
    }

    // `status` and the lifecycle timestamps (submittedAt/approvedAt/etc.)
    // are intentionally omitted from the payload: status moves through
    // `transitionPco` which also stamps the timestamps.
    const payload = {
      projectId: data.projectId,
      pcoNumber: data.pcoNumber,
      ownerReference: data.ownerReference,
      title: data.title,
      description: data.description,
      priority: data.priority,
      requestedAmount: data.requestedAmount,
      approvedAmount: data.approvedAmount,
      scheduleDaysImpact: data.scheduleDaysImpact,
      ownerRepName: data.ownerRepName,
      ownerRepEmail: data.ownerRepEmail,
      reasonNarrative: data.reasonNarrative,
      notes: data.notes,
      invoiceNumber: data.invoiceNumber,
      initiatedBy: data.initiatedBy,
    };

    const row = await prisma.$transaction(async (tx) => {
      let pcoId: number;
      if (data.id) {
        const before = await tx.pco.findUniqueOrThrow({
          where: { id: data.id },
        });
        const updated = await tx.pco.update({
          where: { id: data.id },
          data: payload,
        });
        await recordUpdate(
          tx,
          {
            entityType: "Pco",
            entityId: updated.id,
            projectId: updated.projectId,
            actor,
          },
          diffFields(before, updated, PCO_AUDIT_FIELDS),
        );
        pcoId = updated.id;
      } else {
        const created = await tx.pco.create({
          data: { ...payload, createdById: actor.id },
        });
        await recordCreate(tx, {
          entityType: "Pco",
          entityId: created.id,
          projectId: created.projectId,
          actor,
        });
        pcoId = created.id;
      }

      // CVR-link sync — diff current set against requested set, then issue
      // two bulk updates: detach the ones being removed, attach the new
      // ones. Audited per CVR so the CVR's history shows the (un)link.
      const currentLinks = await tx.changeLog.findMany({
        where: { linkedPcoId: pcoId },
        select: { id: true, projectId: true },
      });
      const currentIds = new Set(currentLinks.map((c) => c.id));
      const requestedIds = new Set(data.linkedCvrIds);
      const toAttach = data.linkedCvrIds.filter((id) => !currentIds.has(id));
      const toDetach = Array.from(currentIds).filter(
        (id) => !requestedIds.has(id),
      );
      if (toDetach.length > 0) {
        await tx.changeLog.updateMany({
          where: { id: { in: toDetach } },
          data: { linkedPcoId: null },
        });
        for (const cvrId of toDetach) {
          await recordUpdate(
            tx,
            {
              entityType: "ChangeLog",
              entityId: cvrId,
              projectId: data.projectId,
              actor,
            },
            [
              {
                field: "linkedPcoId",
                oldValue: String(pcoId),
                newValue: null,
              },
            ],
          );
        }
      }
      if (toAttach.length > 0) {
        await tx.changeLog.updateMany({
          where: { id: { in: toAttach } },
          data: { linkedPcoId: pcoId },
        });
        for (const cvrId of toAttach) {
          await recordUpdate(
            tx,
            {
              entityType: "ChangeLog",
              entityId: cvrId,
              projectId: data.projectId,
              actor,
            },
            [
              {
                field: "linkedPcoId",
                oldValue: null,
                newValue: String(pcoId),
              },
            ],
          );
        }
      }
      // Re-fetch the freshly-upserted PCO with the `linkedCvrs` relation
      // INSIDE the transaction (instead of after it). Same number of reads
      // as before, but the second read uses the same transaction's
      // connection and sees the link-sync writes above without a separate
      // round-trip to a fresh connection. The link sync is between the
      // upsert and this read, so we can't fold the include into the upsert
      // itself the way FCO/RFI do.
      return tx.pco.findUniqueOrThrow({
        where: { id: pcoId },
        include: linkedCvrsInclude,
      });
    });

    return toItem(row);
  });

// Owner-facing review steps fan out to the reviewer pool. INVOICED/CLOSED
// are bookkeeping; only the originator needs to know.
const PCO_STATUSES_NEEDING_REVIEW: ReadonlySet<string> = new Set([
  "SUBMITTED",
  "NEGOTIATING",
]);

export const transitionPco = createServerFn({ method: "POST" })
  .inputValidator(parseTransitionInput)
  .handler(async ({ data }): Promise<PcoItem> => {
    const pre = await prisma.pco.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await requireProjectAccess(pre.projectId);
    // Apply the workflow transition with the `linkedCvrs` include on both
    // before and update so the row exiting the transaction already carries
    // the relation needed by toItem. Eliminates the post-tx re-fetch.
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.pco.findUniqueOrThrow({
        where: { id: data.id },
        include: linkedCvrsInclude,
      });
      return applyWorkflowTransition({
        tx,
        before,
        actor,
        action: data.action,
        comment: data.comment,
        config: {
          entityType: "Pco",
          transitionMap: PCO_TRANSITIONS,
          statusLabels: PCO_STATUS_LABELS,
          statusesNeedingReview: PCO_STATUSES_NEEDING_REVIEW,
          auditFields: [
            "status",
            "submittedAt",
            "approvedAt",
            "invoicedAt",
            "paidAt",
            "closedAt",
          ],
          buildTitle: (r) =>
            r.pcoNumber ? `${r.pcoNumber} — ${r.title}` : r.title,
          // Stamp the matching timestamp on each transition so list views
          // can show "submitted on" / "approved on" / etc. without a
          // separate UPDATE round-trip. `approvedAmount` is also
          // initialized to `requestedAmount` on first APPROVED if the user
          // hasn't already set it — saves a step in the common "owner
          // accepted as-is" case.
          extraUpdateData: (transition) => {
            switch (transition.to) {
              case "SUBMITTED":
                // Submit can happen from DRAFT (first submission) or from
                // NEGOTIATING (resubmit). Only stamp the first one — leave
                // resubmits alone so submittedAt reflects the original ask.
                return before.submittedAt
                  ? {}
                  : { submittedAt: new Date() };
              case "APPROVED":
                return {
                  approvedAt: new Date(),
                  ...(before.approvedAmount === 0
                    ? { approvedAmount: before.requestedAmount }
                    : {}),
                };
              case "INVOICED":
                return { invoicedAt: new Date() };
              case "CLOSED":
                return { paidAt: new Date(), closedAt: new Date() };
              default:
                return {};
            }
          },
        },
        updateRow: (data) =>
          tx.pco.update({
            where: { id: before.id },
            data,
            include: linkedCvrsInclude,
          }),
      });
    });
    return toItem(row);
  });

export const deletePco = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const row = await prisma.pco.findUniqueOrThrow({
      where: { id: data.id },
      select: { projectId: true },
    });
    const actor = await resolveCurrentUser();
    if (!actor) throw new Error("Unauthorized: not signed in");
    await assertProjectAccess(actor, row.projectId);
    await prisma.$transaction(async (tx) => {
      // Schema's SetNull on ChangeLog.linkedPco handles the cascade — any
      // attached CVRs end up unlinked rather than orphaned. The audit
      // event below records the PCO delete; CVR unlinking shows up
      // separately as their own audit if we ever surface that lookup.
      await tx.pco.delete({ where: { id: data.id } });
      await recordDelete(tx, {
        entityType: "Pco",
        entityId: data.id,
        projectId: row.projectId,
        actor,
      });
    });
    return { ok: true };
  });

/**
 * Cache-bust set fired after every PCO mutation. A PCO upsert can re-link
 * CVRs (attach/detach via the dialog's CVR picker), so the CVR caches drop
 * too — the changelog row's `linkedPcoId` is reflected in the list view.
 * Previously the route inlined `["changelog", projectId]` (lowercase) which
 * silently no-op'd against the actual `["changeLog", projectId]` cache key.
 */
export function invalidatePcoQueries(
  queryClient: QueryClient,
  projectId: number | null,
): void {
  invalidateEntityRecordQueries(queryClient, {
    list: qk.pcos.list(projectId),
    full: qk.pcos.full(projectId),
    singleAll: qk.pcos.singleAll(),
  });
  queryClient.invalidateQueries({ queryKey: qk.changeLog.list(projectId) });
  queryClient.invalidateQueries({ queryKey: qk.changeLog.full(projectId) });
  // The "eligible CVRs" picker depends on which CVRs are unlinked vs.
  // attached; a PCO upsert can change that, so drop every cached variant
  // for this project. Prefix-match: `["pcos", "eligibleCvrs", projectId]`
  // matches every cached `currentPcoId` for the project.
  queryClient.invalidateQueries({
    queryKey: ["pcos", "eligibleCvrs", projectId],
  });
}
