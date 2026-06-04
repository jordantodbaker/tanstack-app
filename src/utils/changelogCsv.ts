import {
  fmtDate,
  fmtDiscipline,
  fmtList,
  type CsvColumn,
} from "~/lib/csv-export";
import type { ChangeLogItem } from "./changelog";
import { STATUS_LABELS } from "./changelogLabels";

/**
 * Column definitions for the change log CSV export. Lives in its own module
 * (not the route file) so the column set can be unit-tested without dragging
 * the React route in. `areaLabel` is a closure parameter because area
 * resolution requires the project's area list, which is component-scoped.
 */
export function cvrCsvColumns(
  areaLabel: (raw: string) => string,
): CsvColumn<ChangeLogItem>[] {
  return [
    { header: "CVR #", get: (c) => c.cvrNumber },
    { header: "Title", get: (c) => c.title },
    { header: "Status", get: (c) => STATUS_LABELS[c.status] },
    { header: "Type", get: (c) => c.type },
    { header: "Discipline", get: (c) => fmtDiscipline(c.discipline) },
    { header: "Area", get: (c) => (c.area ? areaLabel(c.area) : "") },
    { header: "Risk Level", get: (c) => c.riskLevel },
    { header: "Cost Impact ($)", get: (c) => c.costImpact },
    { header: "Schedule Impact (days)", get: (c) => c.scheduleDaysImpact },
    { header: "Labor Hours Impact", get: (c) => c.laborHoursImpact },
    { header: "Originator", get: (c) => c.originator },
    { header: "Approver", get: (c) => c.approver },
    { header: "Reason Code", get: (c) => c.reasonCode },
    { header: "CBS Codes", get: (c) => fmtList(c.cbsCodes) },
    { header: "Requested Date", get: (c) => fmtDate(c.requestedAt) },
    { header: "Due Date", get: (c) => fmtDate(c.dueDate) },
    { header: "Approved Date", get: (c) => fmtDate(c.approvedAt) },
    { header: "Description", get: (c) => c.description },
    { header: "Notes", get: (c) => c.notes },
  ];
}
