import type { CsvColumn } from "~/lib/csv-export";
import { disciplineById } from "~/config/disciplines";
import type { FcoItem } from "./fcoLog";
import { FCO_ORIGIN_LABELS, FCO_STATUS_LABELS } from "./fcoLogLabels";

/**
 * Column definitions for the FCO log CSV export. Lives in its own module so
 * the column set can be unit-tested without pulling the React route in.
 * `areaLabel` is a closure parameter because area resolution requires the
 * project's area list, which is component-scoped.
 */
export function fcoCsvColumns(
  areaLabel: (raw: string) => string,
): CsvColumn<FcoItem>[] {
  return [
    { header: "FCO #", get: (f) => f.fcoNumber },
    { header: "Title", get: (f) => f.title },
    { header: "Status", get: (f) => FCO_STATUS_LABELS[f.status] },
    { header: "Origin", get: (f) => FCO_ORIGIN_LABELS[f.originType] },
    { header: "Priority", get: (f) => f.priority },
    {
      header: "Discipline",
      get: (f) => disciplineById[f.discipline]?.label ?? f.discipline,
    },
    {
      header: "Area",
      get: (f) => (f.locationArea ? areaLabel(f.locationArea) : ""),
    },
    { header: "Est. Cost ($)", get: (f) => f.estimatedCost },
    { header: "Est. Hours", get: (f) => f.estimatedHours },
    { header: "Work Stopped", get: (f) => (f.workStopped ? "Yes" : "No") },
    { header: "Initiated By", get: (f) => f.initiatedBy },
    { header: "Field Contact", get: (f) => f.fieldContact },
    { header: "CBS Codes", get: (f) => f.cbsCodes.join("; ") },
    { header: "Drawing Refs", get: (f) => f.drawingRefs.join("; ") },
    { header: "RFI Numbers", get: (f) => f.rfiNumbers.join("; ") },
    { header: "Initiated Date", get: (f) => f.initiatedAt.slice(0, 10) },
    { header: "Needed By", get: (f) => f.neededBy?.slice(0, 10) ?? "" },
    { header: "Closed Date", get: (f) => f.closedAt?.slice(0, 10) ?? "" },
    { header: "Linked CVR #", get: (f) => f.linkedCvrNumber ?? "" },
    { header: "Description", get: (f) => f.description },
    { header: "Reason Narrative", get: (f) => f.reasonNarrative },
    { header: "Resolution", get: (f) => f.resolution },
    { header: "Notes", get: (f) => f.notes },
  ];
}
