import {
  fmtBool,
  fmtDate,
  fmtDiscipline,
  fmtList,
  type CsvColumn,
} from "~/lib/csv-export";
import type { RfiItem } from "./rfis";
import { RFI_PRIORITY_LABELS, RFI_STATUS_LABELS } from "./rfiLabels";

/**
 * Column definitions for the RFI CSV export. Mirrors `cvrCsvColumns` /
 * `fcoCsvColumns` — lives in its own module so the column set can be unit-
 * tested without dragging the route in. `areaLabel` is a closure parameter
 * because area resolution requires the project's area list.
 */
export function rfiCsvColumns(
  areaLabel: (raw: string) => string,
): CsvColumn<RfiItem>[] {
  return [
    { header: "RFI #", get: (r) => r.rfiNumber },
    { header: "Subject", get: (r) => r.subject },
    { header: "Status", get: (r) => RFI_STATUS_LABELS[r.status] },
    { header: "Priority", get: (r) => RFI_PRIORITY_LABELS[r.priority] },
    { header: "Discipline", get: (r) => fmtDiscipline(r.discipline) },
    { header: "Area", get: (r) => (r.locationArea ? areaLabel(r.locationArea) : "") },
    { header: "Initiated By", get: (r) => r.initiatedBy },
    { header: "Assigned To", get: (r) => r.assignedTo },
    { header: "Suspects Cost Impact", get: (r) => fmtBool(r.suspectsCostImpact) },
    { header: "Suspects Schedule Impact", get: (r) => fmtBool(r.suspectsScheduleImpact) },
    { header: "CBS Codes", get: (r) => fmtList(r.cbsCodes) },
    { header: "Drawing Refs", get: (r) => fmtList(r.drawingRefs) },
    { header: "Spec Refs", get: (r) => fmtList(r.specRefs) },
    { header: "Initiated Date", get: (r) => fmtDate(r.initiatedAt) },
    { header: "Due Date", get: (r) => fmtDate(r.dueDate) },
    { header: "Answered Date", get: (r) => fmtDate(r.answeredAt) },
    { header: "Answered By", get: (r) => r.answeredBy },
    { header: "Closed Date", get: (r) => fmtDate(r.closedAt) },
    {
      header: "Linked FCOs",
      get: (r) =>
        r.linkedFcos.map((f) => f.fcoNumber || `FCO #${f.id}`).join("; "),
    },
    { header: "Question", get: (r) => r.question },
    { header: "Response", get: (r) => r.response },
  ];
}
