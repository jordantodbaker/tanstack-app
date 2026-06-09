/**
 * Runtime input validation for every `createServerFn` call.
 *
 * Until this module existed, `inputValidator` was a typed identity function:
 *
 *   .inputValidator((input: { id: number }) => input)
 *
 * The TypeScript annotation looked safe but did nothing at runtime — the
 * server fn happily forwarded whatever JSON the client (or an attacker) sent
 * straight into Prisma. A hostile or buggy caller could send `id: "1; DROP …"`
 * or `projectId: { $gt: 0 }` and the handler would only fail downstream, deep
 * in the query layer (or worse, silently coerce).
 *
 * The schemas here run at the boundary instead. They throw a structured Zod
 * error on shape mismatch, which `createServerFn` surfaces as a 400 to the
 * client.
 *
 * Convention: schemas are CamelCase + `Schema` suffix; exporting `parseX`
 * helpers as `(input: unknown) => X` so callsites stay one-liners:
 *
 *   .inputValidator(parseIdInput)
 *   .inputValidator(parseUpsertChangeLog)
 *
 * Where existing types use empty strings as "unset" (matches the dialogs'
 * always-controlled-input pattern), the schema accepts `z.string()` with no
 * `.min(1)`. Required text fields (title, etc.) DO get `.min(1)` because
 * the dialog's submit button is also gated on those.
 */
import { z } from "zod";

// Status / type / priority enums are inlined here (rather than imported from
// the entity utils) because the entity utils import the schemas FROM this
// file — a real import-time cycle would form. The lists are intentionally
// duplicated; if an entity adds a status, both this list and the entity's
// own constant must update. `z.enum` narrows to the literal union at compile
// time, so a forgotten value still wouldn't typecheck against the rest of
// the entity module's handler logic.

const CHANGE_STATUSES = [
  "REQUESTED",
  "IN_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "VOID",
] as const;
const CHANGE_TYPES = [
  "SCOPE",
  "COST",
  "SCHEDULE",
  "ENGINEERING",
  "CONSTRUCTION",
  "PROCUREMENT",
  "REGULATORY",
  "OTHER",
] as const;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const CVR_COST_TYPES = [
  "LABOR",
  "MATERIAL",
  "EQUIPMENT",
  "SUBCONTRACT",
  "OTHER",
] as const;
const FCO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "LINKED_TO_CVR",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "CLOSED",
  "VOID",
] as const;
const FCO_ORIGIN_TYPES = [
  "FIELD_CONDITION",
  "RFI_RESPONSE",
  "DESIGN_OMISSION",
  "DESIGN_CONFLICT",
  "OWNER_DIRECTIVE",
  "SAFETY",
  "REGULATORY",
  "WEATHER",
  "SUBCONTRACTOR",
  "OTHER",
] as const;
const FCO_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const RFI_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const TREND_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const PCO_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

// ── Primitives ──────────────────────────────────────────────────────────────

/** Positive integer ID (Prisma autoincrement). Rejects 0, negatives, floats. */
export const Id = z.int().positive();
export const ProjectId = Id;
export const OptionalId = Id.optional();

/** ISO 8601 datetime string (what `new Date(x).toISOString()` produces). */
export const IsoDateString = z.iso.datetime();
/** Nullable variant — dueDate, approvedAt, neededBy etc. are often null. */
export const IsoDateStringOrNull = IsoDateString.nullable();

/** Free-text field that may be empty (matches "" defaults in the schema). */
const Text = z.string();
/** Required-non-empty text (title, name). Trimmed length must be > 0. */
const RequiredText = z.string().trim().min(1);
/** String[] with no per-item constraints. */
const StringArray = z.array(z.string());

const Email = z.union([z.literal(""), z.email()]);
const Money = z.number().finite();
const Int = z.int();

// ── Common server-fn input shapes ────────────────────────────────────────────

/** `{ id }` — used by every delete + many single-fetch handlers. */
export const IdInputSchema = z.object({ id: Id });
export const parseIdInput = (input: unknown) => IdInputSchema.parse(input);

/** Bare positive int — for handlers that take `projectId` directly. */
export const parseProjectIdInput = (input: unknown) => ProjectId.parse(input);
/** Bare positive int — for handlers that take an `id` directly. */
export const parseIdScalar = (input: unknown) => Id.parse(input);

/** Workflow transition shape — used by every entity's `transitionXxx`. */
export const TransitionInputSchema = z.object({
  id: Id,
  action: z.string().min(1),
  comment: z.string().optional(),
});
export const parseTransitionInput = (input: unknown) =>
  TransitionInputSchema.parse(input);

// ── Entity upsert schemas ────────────────────────────────────────────────────

/** One CVR cost-buildup line. `quantity`/`unitRate` are finite numbers and may
 *  be negative (a credit line). `id` is optional — the upsert recreates lines,
 *  so it's only meaningful as a client React key. */
export const CvrLineItemSchema = z.object({
  id: OptionalId,
  position: Int,
  description: Text,
  costType: z.enum(CVR_COST_TYPES),
  quantity: Money,
  unit: Text,
  unitRate: Money,
  notes: Text,
});

export const UpsertChangeLogSchema = z.object({
  id: OptionalId,
  projectId: ProjectId,
  cvrNumber: Text,
  title: RequiredText,
  description: Text,
  status: z.enum(CHANGE_STATUSES),
  type: z.enum(CHANGE_TYPES),
  discipline: Text,
  cbsCodes: StringArray,
  originator: Text,
  costImpact: Money,
  scheduleDaysImpact: Int,
  laborHoursImpact: Money,
  riskLevel: z.enum(RISK_LEVELS),
  reasonCode: Text,
  requestedAt: IsoDateString,
  dueDate: IsoDateStringOrNull,
  approvedAt: IsoDateStringOrNull,
  approver: Text,
  notes: Text,
  area: Text,
  // Optional cost buildup. `.default([])` keeps payloads that omit it valid.
  lineItems: z.array(CvrLineItemSchema).default([]),
});
export const parseUpsertChangeLog = (input: unknown) =>
  UpsertChangeLogSchema.parse(input);

export const UpsertFcoSchema = z.object({
  id: OptionalId,
  projectId: ProjectId,
  fcoNumber: Text,
  title: RequiredText,
  description: Text,
  status: z.enum(FCO_STATUSES),
  originType: z.enum(FCO_ORIGIN_TYPES),
  priority: z.enum(FCO_PRIORITIES),
  discipline: Text,
  cbsCodes: StringArray,
  locationArea: Text,
  drawingRefs: StringArray,
  rfiNumbers: StringArray,
  initiatedBy: Text,
  fieldContact: Text,
  estimatedCost: Money,
  estimatedHours: Money,
  workStopped: z.boolean(),
  photosUrl: Text,
  reasonNarrative: Text,
  resolution: Text,
  notes: Text,
  initiatedAt: IsoDateString,
  neededBy: IsoDateStringOrNull,
  closedAt: IsoDateStringOrNull,
  linkedCvrId: Id.nullable(),
});
export const parseUpsertFco = (input: unknown) => UpsertFcoSchema.parse(input);

export const UpsertRfiSchema = z.object({
  id: OptionalId,
  projectId: ProjectId,
  rfiNumber: Text,
  subject: RequiredText,
  question: Text,
  priority: z.enum(RFI_PRIORITIES),
  discipline: Text,
  cbsCodes: StringArray,
  locationArea: Text,
  drawingRefs: StringArray,
  specRefs: StringArray,
  suspectsCostImpact: z.boolean(),
  suspectsScheduleImpact: z.boolean(),
  initiatedBy: Text,
  assignedTo: Text,
  dueDate: IsoDateStringOrNull,
  initiatedAt: IsoDateString,
  response: Text,
  answeredBy: Text,
});
export const parseUpsertRfi = (input: unknown) => UpsertRfiSchema.parse(input);

export const UpsertTrendSchema = z.object({
  id: OptionalId,
  projectId: ProjectId,
  trendNumber: Text,
  title: RequiredText,
  description: Text,
  priority: z.enum(TREND_PRIORITIES),
  discipline: Text,
  cbsCodes: StringArray,
  locationArea: Text,
  // Probability is in [0,1] but server clamps anyway — schema accepts any
  // finite number and lets `clampProbability` normalize. Documenting the
  // intent here without duplicating the clamp logic.
  probability: Money,
  costLow: Money,
  costLikely: Money,
  costHigh: Money,
  scheduleDaysImpact: Int,
  reasonNarrative: Text,
  notes: Text,
  identifiedAt: IsoDateString,
  neededBy: IsoDateStringOrNull,
  linkedRfiId: Id.nullable(),
  linkedFcoId: Id.nullable(),
  initiatedBy: Text,
});
export const parseUpsertTrend = (input: unknown) =>
  UpsertTrendSchema.parse(input);

export const UpsertPcoSchema = z.object({
  id: OptionalId,
  projectId: ProjectId,
  pcoNumber: Text,
  ownerReference: Text,
  title: RequiredText,
  description: Text,
  priority: z.enum(PCO_PRIORITIES),
  requestedAmount: Money,
  approvedAmount: Money,
  scheduleDaysImpact: Int,
  ownerRepName: Text,
  ownerRepEmail: Email,
  reasonNarrative: Text,
  notes: Text,
  invoiceNumber: Text,
  initiatedBy: Text,
  linkedCvrIds: z.array(Id),
});
export const parseUpsertPco = (input: unknown) => UpsertPcoSchema.parse(input);

// ── Global search ────────────────────────────────────────────────────────────

/** Cross-entity project search input. `query` is trimmed; a <2-char term is
 *  rejected here (the palette also gates on length client-side). */
export const SearchInputSchema = z.object({
  projectId: ProjectId,
  query: z.string().trim().min(2).max(100),
});
export const parseSearchInput = (input: unknown) => SearchInputSchema.parse(input);

// ── Promotion / cross-entity action inputs ──────────────────────────────────

export const PromoteFcoInputSchema = z.object({ fcoId: Id });
export const parsePromoteFcoInput = (input: unknown) =>
  PromoteFcoInputSchema.parse(input);

export const PromoteRfiInputSchema = z.object({ rfiId: Id });
export const parsePromoteRfiInput = (input: unknown) =>
  PromoteRfiInputSchema.parse(input);

export const PromoteTrendInputSchema = z.object({ trendId: Id });
export const parsePromoteTrendInput = (input: unknown) =>
  PromoteTrendInputSchema.parse(input);

// ── Admin upserts ───────────────────────────────────────────────────────────

export const UpsertAreaSchema = z.object({
  id: OptionalId,
  projectId: ProjectId,
  displayId: Text,
  name: RequiredText,
  description: Text,
});
export const parseUpsertArea = (input: unknown) =>
  UpsertAreaSchema.parse(input);

export const UpsertSubcontractorSchema = z.object({
  id: OptionalId,
  displayId: Text,
  name: RequiredText,
  description: Text,
  disciplines: StringArray,
  projectIds: z.array(Id),
});
export const parseUpsertSubcontractor = (input: unknown) =>
  UpsertSubcontractorSchema.parse(input);

export const UpsertProjectSchema = z.object({
  id: OptionalId,
  displayId: Text,
  name: RequiredText,
  description: Text,
  // YYYY-MM-DD or full ISO; new Date() handles both. Accept any string here;
  // the handler's `new Date(x)` already returns Invalid Date for garbage,
  // and Prisma rejects it cleanly. Nullable to allow projects without a
  // schedule.
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  subcontractorIds: z.array(Id),
  userIds: z.array(Id),
  addAreaIds: z.array(Id),
});
export const parseUpsertProject = (input: unknown) =>
  UpsertProjectSchema.parse(input);

export const UpsertRoleSchema = z.object({
  id: OptionalId,
  name: RequiredText,
  disciplines: StringArray,
});
export const parseUpsertRole = (input: unknown) =>
  UpsertRoleSchema.parse(input);

export const UpsertCrewMixSchema = z.object({
  id: OptionalId,
  name: RequiredText,
  description: Text,
  members: z.array(
    z.object({
      jobTitle: Text,
      wage: Money,
    }),
  ),
});
export const parseUpsertCrewMix = (input: unknown) =>
  UpsertCrewMixSchema.parse(input);

export const SetUserSchema = z.object({
  userId: Id,
  role: z.enum(["USER", "APPROVER", "ADMINISTRATOR"] as const),
  projectIds: z.array(Id),
});
export const parseSetUser = (input: unknown) => SetUserSchema.parse(input);

// ── CVR / FCO templates ─────────────────────────────────────────────────────

export const UpsertCvrTemplateSchema = z.object({
  id: OptionalId,
  name: RequiredText,
  templateDescription: Text,
  title: Text,
  description: Text,
  type: z.enum(CHANGE_TYPES),
  discipline: Text,
  cbsCodes: StringArray,
  originator: Text,
  costImpact: Money,
  scheduleDaysImpact: Int,
  laborHoursImpact: Money,
  riskLevel: z.enum(RISK_LEVELS),
  reasonCode: Text,
  notes: Text,
  area: Text,
});
export const parseUpsertCvrTemplate = (input: unknown) =>
  UpsertCvrTemplateSchema.parse(input);

export const UpsertFcoTemplateSchema = z.object({
  id: OptionalId,
  name: RequiredText,
  templateDescription: Text,
  title: Text,
  description: Text,
  originType: z.enum(FCO_ORIGIN_TYPES),
  priority: z.enum(FCO_PRIORITIES),
  discipline: Text,
  cbsCodes: StringArray,
  locationArea: Text,
  drawingRefs: StringArray,
  rfiNumbers: StringArray,
  initiatedBy: Text,
  fieldContact: Text,
  estimatedCost: Money,
  estimatedHours: Money,
  workStopped: z.boolean(),
  photosUrl: Text,
  reasonNarrative: Text,
  notes: Text,
});
export const parseUpsertFcoTemplate = (input: unknown) =>
  UpsertFcoTemplateSchema.parse(input);

/** Instantiation input — just the template id; the handler returns the full
 *  field set for the dialog to populate the form with. */
export const InstantiateTemplateSchema = z.object({ id: Id });
export const parseInstantiateCvrTemplate = (input: unknown) =>
  InstantiateTemplateSchema.parse(input);
export const parseInstantiateFcoTemplate = (input: unknown) =>
  InstantiateTemplateSchema.parse(input);

// ── Status enums (re-exported for convenience) ──────────────────────────────

export type StatusFilter<T extends string> = T | "";
export const StatusFilterSchema = <T extends string>(values: readonly T[]) =>
  z.union([z.literal(""), z.enum(values)]);
