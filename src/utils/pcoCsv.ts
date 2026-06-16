import { fmtDate, type CsvColumn } from "~/lib/csv-export";
import type { PcoItem } from "./pco";
import { PCO_PRIORITY_LABELS, PCO_STATUS_LABELS } from "./pcoLabels";

/**
 * Column definitions for the PCO CSV export. Mirrors `fcoCsvColumns` /
 * `rfiCsvColumns` / `trendCsvColumns`. Lives in its own module so the
 * column set can be unit-tested without dragging the route in.
 */
export function pcoCsvColumns(): CsvColumn<PcoItem>[] {
  return [
    { header: "PCO #", get: (p) => p.pcoNumber },
    { header: "Owner Reference", get: (p) => p.ownerReference },
    { header: "Title", get: (p) => p.title },
    { header: "Status", get: (p) => PCO_STATUS_LABELS[p.status] },
    { header: "Priority", get: (p) => PCO_PRIORITY_LABELS[p.priority] },
    { header: "Requested Amount ($)", get: (p) => p.requestedAmount },
    { header: "Approved Amount ($)", get: (p) => p.approvedAmount },
    { header: "Schedule Days Impact", get: (p) => p.scheduleDaysImpact },
    { header: "Owner Rep", get: (p) => p.ownerRepName },
    { header: "Owner Rep Email", get: (p) => p.ownerRepEmail },
    { header: "Submitted Date", get: (p) => fmtDate(p.submittedAt) },
    { header: "Approved Date", get: (p) => fmtDate(p.approvedAt) },
    { header: "Invoiced Date", get: (p) => fmtDate(p.invoicedAt) },
    { header: "Invoice Number", get: (p) => p.invoiceNumber },
    { header: "Paid Date", get: (p) => fmtDate(p.paidAt) },
    { header: "Closed Date", get: (p) => fmtDate(p.closedAt) },
    { header: "Initiated By", get: (p) => p.initiatedBy },
    {
      header: "Linked CVRs",
      get: (p) =>
        p.linkedCvrs.map((c) => c.cvrNumber || `CVR #${c.id}`).join("; "),
    },
    {
      header: "Linked CVR Total Cost Impact ($)",
      get: (p) => p.linkedCvrs.reduce((sum, c) => sum + c.costImpact, 0),
    },
    { header: "Description", get: (p) => p.description },
    { header: "Reason Narrative", get: (p) => p.reasonNarrative },
    { header: "Notes", get: (p) => p.notes },
  ];
}
