import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { qk } from "~/lib/query-keys";
import { serializeDateFields } from "~/lib/serialize";
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
  projectScopedHandler,
} from "./users.server";
import { assertProjectUnchanged } from "./users";
import {
  deleteProjectScopedRecord,
  transitionProjectScopedRecord,
  upsertProjectScopedRecord,
} from "./entity-writes.server";
import {
  recordUpdates,
} from "./audit.server";
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
    ...serializeDateFields(rest, {
      iso: ["createdAt", "updatedAt"],
      nullable: [
        "submittedAt",
        "approvedAt",
        "invoicedAt",
        "paidAt",
        "closedAt",
      ],
    }),
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
    ...serializeDateFields(rest, {
      iso: ["createdAt", "updatedAt"],
      nullable: [
        "submittedAt",
        "approvedAt",
        "invoicedAt",
        "paidAt",
        "closedAt",
      ],
    }),
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
  .handler(
    projectScopedHandler(async ({ data }): Promise<PcoEligibleCvr[]> => {
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
    }),
  );

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
  .handler(({ data }): Promise<PcoItem> =>
    upsertProjectScopedRecord({
      id: data.id,
      projectId: data.projectId,
      entityType: "Pco",
      label: "PCO",
      pickDelegate: (tx) => tx.pco,
      auditFields: PCO_AUDIT_FIELDS,
      numbering: { field: "pcoNumber", value: data.pcoNumber },
      // Validate every requested CVR link belongs to this project AND is in
      // an attachable state. Doing both checks here keeps the upsert handler
      // the single guard against linking foreign-project / non-approved CVRs.
      validate: async (tx) => {
        if (data.linkedCvrIds.length === 0) return;
        const cvrs = await tx.changeLog.findMany({
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
          if (c.linkedPcoId !== null && c.linkedPcoId !== (data.id ?? -1)) {
            throw new Error(
              "One or more selected CVRs are already attached to a different PCO.",
            );
          }
        }
      },
      // `status` and the lifecycle timestamps (submittedAt/approvedAt/etc.)
      // are intentionally omitted from the payload: status moves through
      // `transitionPco` which also stamps the timestamps.
      payload: {
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
      },
      // CVR-link sync — diff current set against requested set, then issue
      // two bulk updates: detach the ones being removed, attach the new ones.
      // Audited per CVR so the CVR's history shows the (un)link. The sync sits
      // between the upsert and the read, which is why the `linkedCvrs` include
      // can't ride along on the write the way FCO/RFI do; the re-read stays
      // inside the transaction so it sees these writes on the same connection.
      afterWrite: async (tx, pcoId, actor) => {
        const currentLinks = await tx.changeLog.findMany({
          where: { linkedPcoId: pcoId },
          select: { id: true },
        });
        const currentIds = new Set(currentLinks.map((c) => c.id));
        const requestedIds = new Set(data.linkedCvrIds);
        const toAttach = data.linkedCvrIds.filter((id) => !currentIds.has(id));
        const toDetach = Array.from(currentIds).filter(
          (id) => !requestedIds.has(id),
        );
        // One audit row per (un)linked CVR so each CVR's own history shows the
        // change — batched into a single insert rather than one per CVR.
        const linkAudit = (cvrId: number, linked: boolean) => ({
          target: {
            entityType: "ChangeLog",
            entityId: cvrId,
            projectId: data.projectId,
            actor,
          },
          changes: [
            {
              field: "linkedPcoId",
              oldValue: linked ? null : String(pcoId),
              newValue: linked ? String(pcoId) : null,
            },
          ],
        });
        if (toDetach.length > 0) {
          await tx.changeLog.updateMany({
            where: { id: { in: toDetach } },
            data: { linkedPcoId: null },
          });
        }
        if (toAttach.length > 0) {
          await tx.changeLog.updateMany({
            where: { id: { in: toAttach } },
            data: { linkedPcoId: pcoId },
          });
        }
        await recordUpdates(tx, [
          ...toDetach.map((id) => linkAudit(id, false)),
          ...toAttach.map((id) => linkAudit(id, true)),
        ]);
        return tx.pco.findUniqueOrThrow({
          where: { id: pcoId },
          include: linkedCvrsInclude,
        });
      },
      toItem,
    }),
  );

// Owner-facing review steps fan out to the reviewer pool. INVOICED/CLOSED
// are bookkeeping; only the originator needs to know.
const PCO_STATUSES_NEEDING_REVIEW: ReadonlySet<string> = new Set([
  "SUBMITTED",
  "NEGOTIATING",
]);

export const transitionPco = createServerFn({ method: "POST" })
  .inputValidator(parseTransitionInput)
  // The `linkedCvrs` include is applied to both the before-read and the
  // update, so the row exiting the transaction already carries the relation
  // `toItem` needs — no post-commit re-fetch.
  .handler(({ data }): Promise<PcoItem> =>
    transitionProjectScopedRecord({
      id: data.id,
      action: data.action,
      comment: data.comment,
      pickDelegate: (tx) => tx.pco,
      include: linkedCvrsInclude,
      // Config is a function of `before` here: the timestamp stamping below
      // depends on the record's prior state, not just the transition.
      config: (before) => ({
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
        // Stamp the matching timestamp on each transition so list views can
        // show "submitted on" / "approved on" / etc. without a separate
        // UPDATE round-trip. `approvedAmount` is also initialized to
        // `requestedAmount` on first APPROVED if the user hasn't already set
        // it — saves a step in the common "owner accepted as-is" case.
        extraUpdateData: (transition) => {
          switch (transition.to) {
            case "SUBMITTED":
              // Submit can happen from DRAFT (first submission) or from
              // NEGOTIATING (resubmit). Only stamp the first one — leave
              // resubmits alone so submittedAt reflects the original ask.
              return before.submittedAt ? {} : { submittedAt: new Date() };
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
      }),
      toItem,
    }),
  );

export const deletePco = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  // Schema's SetNull on ChangeLog.linkedPco handles the cascade — any
  // attached CVRs end up unlinked rather than orphaned. The audit event
  // records the PCO delete; CVR unlinking shows up separately as their own
  // audit if we ever surface that lookup.
  .handler(({ data }): Promise<{ ok: true }> =>
    deleteProjectScopedRecord({
      id: data.id,
      entityType: "Pco",
      pickDelegate: (tx) => tx.pco,
    }),
  );

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
    queryKey: qk.pcos.eligibleCvrsAll(projectId),
  });
}
