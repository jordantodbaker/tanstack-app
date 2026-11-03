import { prisma } from "../server/db";
import {
  FEF_ROW_STRING_FIELDS,
  isTotalCostComputable,
} from "~/lib/fef-helpers";

/**
 * SERVER-ONLY. Take Off rows per discipline that the user started but whose
 * Total Cost can't be computed — `isTakeOffRowInvalid`, split in two:
 *   1. SQL `WHERE` keeps only TAKE_OFF rows the user has touched (cbsCode or
 *      any free-text field non-empty), so empty template rows never load.
 *   2. JS checks the "not computable" half on just the two inputs it reads.
 *
 * Read by the sidebar badge's own server function, by the project totals, and
 * returned with every take-off save so the badge updates from the save's
 * response instead of a second request.
 */
export async function loadInvalidByDiscipline(
  versionId: number,
): Promise<Record<string, number>> {
  const rows = await prisma.fefRow.findMany({
    where: {
      versionId,
      section: "TAKE_OFF",
      OR: [
        { cbsCode: { not: "" } },
        ...FEF_ROW_STRING_FIELDS.map((f) => ({ [f]: { not: "" } })),
      ],
    },
    select: { discipline: true, laborHours: true, laborRate: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!isTotalCostComputable(r.laborHours, r.laborRate) && r.discipline) {
      out[r.discipline] = (out[r.discipline] ?? 0) + 1;
    }
  }
  return out;
}
