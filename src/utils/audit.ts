import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { z } from "zod";
import { projectScopedHandler } from "./users.server";
import { Id, ProjectId } from "~/lib/validators";

const AuditEventsInputSchema = z.object({
  // entityType is free-form across the audit module (used by attachments,
  // comments, the entity modules themselves), so we keep it as `string`
  // here rather than enumerating. Project-access is still enforced.
  entityType: z.string().min(1),
  entityId: Id,
  projectId: ProjectId,
});

export type AuditEventAction = "CREATE" | "UPDATE" | "DELETE";

/** A single audit-log entry, serialized for the client (dates as ISO). */
export type AuditEventItem = {
  id: number;
  action: AuditEventAction;
  /** Changed column on an UPDATE; null for CREATE/DELETE. */
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  /** Free-text comment, e.g. an approval/rejection reason. */
  note: string | null;
  actorEmail: string;
  createdAt: string;
};

/**
 * Returns the audit history for one entity, newest first. Project-scoped:
 * the caller passes the owning `projectId` and must have access to it.
 */
export const fetchAuditEvents = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => AuditEventsInputSchema.parse(input))
  .handler(
    projectScopedHandler(async ({ data }): Promise<AuditEventItem[]> => {
      const rows = await prisma.auditEvent.findMany({
        where: { entityType: data.entityType, entityId: data.entityId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({
        id: r.id,
        action: r.action as AuditEventAction,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        note: r.note,
        actorEmail: r.actorEmail,
        createdAt: r.createdAt.toISOString(),
      }));
    }),
  );

export const auditEventsQueryOptions = (input: {
  entityType: string;
  entityId: number | null;
  projectId: number | null;
}) =>
  queryOptions({
    queryKey: qk.auditEvents(input.entityType, input.entityId),
    queryFn: (): Promise<AuditEventItem[]> =>
      input.entityId === null || input.projectId === null
        ? Promise.resolve([])
        : fetchAuditEvents({
            data: {
              entityType: input.entityType,
              entityId: input.entityId,
              projectId: input.projectId,
            },
          }),
    enabled: input.entityId !== null && input.projectId !== null,
    staleTime: 30 * 1000,
  });
