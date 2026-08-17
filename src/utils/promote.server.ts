import type { Prisma } from "../generated/prisma/client";
import type { CurrentUser } from "./users";
import { allocateEntityNumber } from "./entityNumbers.server";
import { recordCreate } from "./audit.server";

/**
 * The source-specific fields for a promoted CVR — everything except the ones
 * `createLinkedCvr` always sets itself (project, minted CVR number, `type`,
 * `requestedAt`, `createdById`). Typed off the Prisma create input, so a
 * missing-or-misnamed field is a compile error.
 */
export type LinkedCvrFields = Omit<
  Prisma.ChangeLogUncheckedCreateInput,
  "projectId" | "cvrNumber" | "type" | "requestedAt" | "createdById"
>;

/**
 * Mint a new CVR (ChangeLog) inside an existing transaction and audit its
 * creation. Shared by the promote-to-CVR flows — FCO→CVR (`promoteFcoToCvr`)
 * and Trend→CVR (`promoteTrendToCvr`): both allocate a project CVR number,
 * create a "SCOPE" change stamped `requestedAt` / `createdById`, and record a
 * CREATE audit event. The caller supplies the source-specific fields (title,
 * cost, riskLevel, notes, …) and stamps the source record's link separately.
 */
export async function createLinkedCvr(
  tx: Prisma.TransactionClient,
  actor: CurrentUser,
  projectId: number,
  fields: LinkedCvrFields,
): Promise<{ id: number; projectId: number }> {
  const cvr = await tx.changeLog.create({
    data: {
      projectId,
      // Mint a real CVR number from the project sequence; the source record
      // is referenced in the caller's `notes` / link.
      cvrNumber: await allocateEntityNumber(tx, projectId, "ChangeLog"),
      type: "SCOPE",
      requestedAt: new Date(),
      createdById: actor.id,
      ...fields,
    },
  });
  await recordCreate(tx, {
    entityType: "ChangeLog",
    entityId: cvr.id,
    projectId: cvr.projectId,
    actor,
  });
  return { id: cvr.id, projectId: cvr.projectId };
}
