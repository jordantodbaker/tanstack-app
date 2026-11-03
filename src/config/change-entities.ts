/**
 * The five change-pipeline records — CVR, FCO, RFI, Trend, PCO — in one
 * table, keyed by the `entityType` string that AuditEvent, Notification,
 * Comment and Attachment rows discriminate on.
 *
 * Everything that varies by record type and is not business logic lives
 * here: the short noun, the list page, the print page, the number prefix,
 * and which columns hold the number and the title. The lists that used to be
 * copied into recents, comments, attachments, numbering and the parent
 * lookup now derive from `CHANGE_ENTITY_TYPES`, and every place that names a
 * record ("CVR-014 — Reroute line", or "CVR #14" when it has no number yet)
 * goes through `formatRecordRef`, so a record reads the same in a
 * notification, a picker, a CSV and the sidebar.
 *
 * Adding a sixth record type is a row here plus a Prisma delegate in
 * `entityLookup.server.ts`; the drift guards in `change-entities.test.ts`
 * and `recent-entities.test.ts` name whatever else is missing.
 *
 * No imports: this is read by client code, server code and the validators.
 */

export const CHANGE_ENTITY_TYPES = [
  "ChangeLog",
  "FieldChangeOrder",
  "Rfi",
  "Trend",
  "Pco",
] as const;

export type ChangeEntityType = (typeof CHANGE_ENTITY_TYPES)[number];

export function isChangeEntityType(s: unknown): s is ChangeEntityType {
  return (CHANGE_ENTITY_TYPES as readonly unknown[]).includes(s);
}

export type ChangeEntityDef = {
  /** "CVR" — in sidebar rows, number fallbacks and the Status row's noun. */
  noun: string;
  /** The list page; also where a notification or a recent click lands. */
  listPath: "/changelog" | "/fco-log" | "/rfis" | "/trends" | "/pco";
  /** The printable page, `${printPath}/${id}`, where the record has one. */
  printPath?: "/cvr-print" | "/fco-print" | "/rfi-print";
  /** The project sequence's prefix and zero-padding — see `entityNumbers.server`. */
  number: { prefix: string; padWidth: number };
  /** The column holding the record's number ("CVR-014"). */
  numberField:
    "cvrNumber" | "fcoNumber" | "rfiNumber" | "trendNumber" | "pcoNumber";
  /** The column holding the record's title; the RFI calls it a subject. */
  titleField: "title" | "subject";
};

export const CHANGE_ENTITIES: Record<ChangeEntityType, ChangeEntityDef> = {
  ChangeLog: {
    noun: "CVR",
    listPath: "/changelog",
    printPath: "/cvr-print",
    number: { prefix: "CVR-", padWidth: 3 },
    numberField: "cvrNumber",
    titleField: "title",
  },
  FieldChangeOrder: {
    noun: "FCO",
    listPath: "/fco-log",
    printPath: "/fco-print",
    number: { prefix: "FCO-", padWidth: 3 },
    numberField: "fcoNumber",
    titleField: "title",
  },
  Rfi: {
    noun: "RFI",
    listPath: "/rfis",
    printPath: "/rfi-print",
    number: { prefix: "RFI-", padWidth: 3 },
    numberField: "rfiNumber",
    titleField: "subject",
  },
  Trend: {
    noun: "Trend",
    listPath: "/trends",
    number: { prefix: "TR-", padWidth: 3 },
    numberField: "trendNumber",
    titleField: "title",
  },
  Pco: {
    noun: "PCO",
    listPath: "/pco",
    number: { prefix: "PCO-", padWidth: 3 },
    numberField: "pcoNumber",
    titleField: "title",
  },
};

/** A row with at least an id; the number column is read by name. */
type NumberedRow = { id: number } & Record<string, unknown>;

/**
 * How a record is named: its number, or "CVR #14" until it has one. The
 * fallback is the same everywhere, so a record saved before its number was
 * allocated reads the same in a notification as in a picker.
 */
export function recordNumber(
  entityType: ChangeEntityType,
  row: NumberedRow,
): string {
  const def = CHANGE_ENTITIES[entityType];
  const number = row[def.numberField];
  return typeof number === "string" && number !== ""
    ? number
    : `${def.noun} #${row.id}`;
}

/**
 * "CVR-014 — Reroute line": the number, then the title where there is one.
 * `title` defaults to the row's own title column.
 */
export function formatRecordRef(
  entityType: ChangeEntityType,
  row: NumberedRow,
  title?: string | null,
): string {
  const def = CHANGE_ENTITIES[entityType];
  const text = title === undefined ? row[def.titleField] : title;
  const number = recordNumber(entityType, row);
  return typeof text === "string" && text !== ""
    ? `${number} — ${text}`
    : number;
}
