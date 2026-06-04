import {
  fmtBool,
  fmtDate,
  fmtDiscipline,
  fmtList,
  type CsvColumn,
} from "~/lib/csv-export";
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
    { header: "Discipline", get: (f) => fmtDiscipline(f.discipline) },
    {
      header: "Area",
      get: (f) => (f.locationArea ? areaLabel(f.locationArea) : ""),
    },
    { header: "Est. Cost ($)", get: (f) => f.estimatedCost },
    { header: "Est. Hours", get: (f) => f.estimatedHours },
    { header: "Work Stopped", get: (f) => fmtBool(f.workStopped) },
    { header: "Initiated By", get: (f) => f.initiatedBy },
    { header: "Field Contact", get: (f) => f.fieldContact },
    { header: "CBS Codes", get: (f) => fmtList(f.cbsCodes) },
    { header: "Drawing Refs", get: (f) => fmtList(f.drawingRefs) },
    { header: "RFI Numbers", get: (f) => fmtList(f.rfiNumbers) },
    { header: "Initiated Date", get: (f) => fmtDate(f.initiatedAt) },
    { header: "Needed By", get: (f) => fmtDate(f.neededBy) },
    { header: "Closed Date", get: (f) => fmtDate(f.closedAt) },
    { header: "Linked CVR #", get: (f) => f.linkedCvrNumber ?? "" },
    { header: "Description", get: (f) => f.description },
    { header: "Reason Narrative", get: (f) => f.reasonNarrative },
    { header: "Resolution", get: (f) => f.resolution },
    { header: "Notes", get: (f) => f.notes },
  ];
}
