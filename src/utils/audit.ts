import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { requireProjectAccess } from "./users.server";

export type AuditEventAction = "CREATE" | "UPDATE" | "DELETE";

/** A single audit-log entry, serialized for the client (dates as ISO). */
export type AuditEventItem = {
  id: number;
  action: AuditEventAction;
  /** Changed column on an UPDATE; null for CREATE/DELETE. */
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  actorEmail: string;
  createdAt: string;
};

/**
 * Returns the audit history for one entity, newest first. Project-scoped:
 * the caller passes the owning `projectId` and must have access to it.
 */
export const fetchAuditEvents = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { entityType: string; entityId: number; projectId: number }) =>
      input,
  )
  .handler(async ({ data }): Promise<AuditEventItem[]> => {
    await requireProjectAccess(data.projectId);
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
      actorEmail: r.actorEmail,
      createdAt: r.createdAt.toISOString(),
    }));
  });

export const auditEventsQueryOptions = (input: {
  entityType: string;
  entityId: number | null;
  projectId: number | null;
}) =>
  queryOptions({
    queryKey: ["auditEvents", input.entityType, input.entityId],
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
