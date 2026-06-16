import {
  fmtDate,
  fmtDiscipline,
  fmtList,
  type CsvColumn,
} from "~/lib/csv-export";
import type { TrendItem } from "./trends";
import { TREND_PRIORITY_LABELS, TREND_STATUS_LABELS } from "./trendLabels";

/**
 * Column definitions for the Trend CSV export. Mirrors `fcoCsvColumns` /
 * `rfiCsvColumns` — lives in its own module so the column set can be unit-
 * tested without dragging the route in. `areaLabel` is a closure parameter
 * because area resolution requires the project's area list.
 */
export function trendCsvColumns(
  areaLabel: (raw: string) => string,
): CsvColumn<TrendItem>[] {
  return [
    { header: "Trend #", get: (t) => t.trendNumber },
    { header: "Title", get: (t) => t.title },
    { header: "Status", get: (t) => TREND_STATUS_LABELS[t.status] },
    { header: "Priority", get: (t) => TREND_PRIORITY_LABELS[t.priority] },
    { header: "Discipline", get: (t) => fmtDiscipline(t.discipline) },
    {
      header: "Area",
      get: (t) => (t.locationArea ? areaLabel(t.locationArea) : ""),
    },
    { header: "CBS Codes", get: (t) => fmtList(t.cbsCodes) },
    { header: "Probability", get: (t) => t.probability },
    { header: "Cost Low ($)", get: (t) => t.costLow },
    { header: "Cost Likely ($)", get: (t) => t.costLikely },
    { header: "Cost High ($)", get: (t) => t.costHigh },
    { header: "Schedule Days Impact", get: (t) => t.scheduleDaysImpact },
    { header: "Initiated By", get: (t) => t.initiatedBy },
    { header: "Identified Date", get: (t) => fmtDate(t.identifiedAt) },
    { header: "Needed By", get: (t) => fmtDate(t.neededBy) },
    { header: "Closed Date", get: (t) => fmtDate(t.closedAt) },
    { header: "Linked RFI (id)", get: (t) => t.linkedRfiId ?? "" },
    { header: "Linked FCO (id)", get: (t) => t.linkedFcoId ?? "" },
    { header: "Linked CVR (id)", get: (t) => t.linkedCvrId ?? "" },
    { header: "Description", get: (t) => t.description },
    { header: "Reason Narrative", get: (t) => t.reasonNarrative },
    { header: "Notes", get: (t) => t.notes },
  ];
}
