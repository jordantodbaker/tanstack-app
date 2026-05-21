import { useQuery } from "@tanstack/react-query";
import { auditEventsQueryOptions, type AuditEventItem } from "~/utils/audit";

/** "estimatedCost" → "Estimated cost" — good enough for audit field labels. */
function humanizeField(field: string): string {
  const spaced = field.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function displayValue(v: string | null): string {
  return v === null || v === "" ? "(empty)" : v;
}

/**
 * Reverse-chronological audit history for a single entity. Renders the
 * "History" tab of the CVR and FCO dialogs.
 */
export function AuditTimeline({
  entityType,
  entityId,
  projectId,
}: {
  entityType: string;
  entityId: number | null;
  projectId: number | null;
}) {
  const { data: events = [], isPending } = useQuery(
    auditEventsQueryOptions({ entityType, entityId, projectId }),
  );

  if (entityId === null || projectId === null) {
    return (
      <p className="text-sm text-slate-500">
        History will appear here after this record is first saved.
      </p>
    );
  }
  if (isPending) {
    return <p className="text-sm text-slate-400">Loading history…</p>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No history recorded yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <AuditRow key={event.id} event={event} />
      ))}
    </ul>
  );
}

function AuditRow({ event }: { event: AuditEventItem }) {
  return (
    <li className="border-l-2 border-slate-200 pl-3">
      <div className="text-sm text-slate-700">
        <AuditSummary event={event} />
      </div>
      <div className="text-xs text-slate-400">
        {event.actorEmail} · {new Date(event.createdAt).toLocaleString()}
      </div>
    </li>
  );
}

function AuditSummary({ event }: { event: AuditEventItem }) {
  if (event.action === "CREATE") {
    return <span className="font-medium text-emerald-700">Created</span>;
  }
  if (event.action === "DELETE") {
    return <span className="font-medium text-red-700">Deleted</span>;
  }
  // UPDATE — one event per changed field. Status transitions read distinctly.
  const field = event.field ?? "";
  const isStatus = field === "status";
  return (
    <span>
      <span
        className={
          isStatus ? "font-semibold text-slate-800" : "font-medium"
        }
      >
        {isStatus ? "Status" : humanizeField(field)}
      </span>
      {": "}
      <span className="text-slate-500">{displayValue(event.oldValue)}</span>
      <span className="mx-1 text-slate-400">→</span>
      <span className="text-slate-800">{displayValue(event.newValue)}</span>
    </span>
  );
}
