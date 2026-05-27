import type { CsvColumn } from "~/lib/csv-export";
import { disciplineById } from "~/config/disciplines";
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
    {
      header: "Discipline",
      get: (r) => disciplineById[r.discipline]?.label ?? r.discipline,
    },
    { header: "Area", get: (r) => (r.locationArea ? areaLabel(r.locationArea) : "") },
    { header: "Initiated By", get: (r) => r.initiatedBy },
    { header: "Assigned To", get: (r) => r.assignedTo },
    { header: "Suspects Cost Impact", get: (r) => (r.suspectsCostImpact ? "Yes" : "No") },
    {
      header: "Suspects Schedule Impact",
      get: (r) => (r.suspectsScheduleImpact ? "Yes" : "No"),
    },
    { header: "CBS Codes", get: (r) => r.cbsCodes.join("; ") },
    { header: "Drawing Refs", get: (r) => r.drawingRefs.join("; ") },
    { header: "Spec Refs", get: (r) => r.specRefs.join("; ") },
    { header: "Initiated Date", get: (r) => r.initiatedAt.slice(0, 10) },
    { header: "Due Date", get: (r) => r.dueDate?.slice(0, 10) ?? "" },
    { header: "Answered Date", get: (r) => r.answeredAt?.slice(0, 10) ?? "" },
    { header: "Answered By", get: (r) => r.answeredBy },
    { header: "Closed Date", get: (r) => r.closedAt?.slice(0, 10) ?? "" },
    {
      header: "Linked FCOs",
      get: (r) =>
        r.linkedFcos.map((f) => f.fcoNumber || `FCO #${f.id}`).join("; "),
    },
    { header: "Question", get: (r) => r.question },
    { header: "Response", get: (r) => r.response },
  ];
}
