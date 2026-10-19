import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, adminHandlerNoInput, requireRole } from "./users.server";
import {
  parseIdInput,
  parseUpsertCvrTemplate,
  parseInstantiateCvrTemplate,
} from "~/lib/validators";
import {
  templateOps,
  type TemplateMeta,
  type TemplatePickerItem,
  type UpsertTemplateInput,
} from "./templates.server";
import type { ChangeType, RiskLevel } from "./changelog";

/**
 * CVR templates — reusable scaffolds for repeat scope changes ("Weather
 * Delay", "Owner Directive Rework", "Design Omission"). Admin-managed,
 * company-wide. The dialog's "Start from template" picker (CREATE mode
 * only) pre-populates the form; the user reviews and saves to mint a real
 * ChangeLog row.
 *
 * The instantiation handler bumps `usageCount` so the per-discipline picker
 * sort can show most-used templates first — Phase 2 of the templates
 * feature. The bump is best-effort and not gated on the CVR-create success;
 * a failed CVR-create still counts as an attempt (the template was chosen).
 *
 * What a template IS lives here — the field set, the guards, the query keys.
 * What the six operations DO is shared with the FCO templates in
 * `templates.server.ts`; only the field list and the model differ. The server
 * functions stay here because `createServerFn` identifies one by its call
 * site, so the two features cannot share them.
 */
export const CVR_TEMPLATE_FIELDS = [
  "title",
  "description",
  "type",
  "discipline",
  "cbsCodes",
  "originator",
  "costImpact",
  "scheduleDaysImpact",
  "laborHoursImpact",
  "riskLevel",
  "reasonCode",
  "notes",
  "area",
] as const;

export type CvrTemplateFieldSet = {
  title: string;
  description: string;
  type: ChangeType;
  discipline: string;
  cbsCodes: string[];
  originator: string;
  costImpact: number;
  scheduleDaysImpact: number;
  laborHoursImpact: number;
  riskLevel: RiskLevel;
  reasonCode: string;
  notes: string;
  area: string;
};

/**
 * Built inside each handler rather than once at module scope: a top-level
 * `prisma.cvrTemplate` reference survives the client transform, and this
 * module is client-reachable. Not exported, so it is dead-stripped with the
 * handler bodies — see the `no-prisma-in-client` guard.
 */
const ops = () =>
  templateOps<CvrTemplateFieldSet>(prisma.cvrTemplate, CVR_TEMPLATE_FIELDS);

/**
 * Picker payload shown in the dialog. Slim — drops `notes` and the longer
 * `description` until the user actually selects the template. The full
 * field set arrives via `instantiateCvrTemplate`, which is what populates
 * the form.
 */
export type CvrTemplatePickerItem = TemplatePickerItem;

export const fetchCvrTemplatePickerItems = createServerFn({
  method: "GET",
}).handler((): Promise<CvrTemplatePickerItem[]> => ops().picker());

export const cvrTemplatePickerQueryOptions = () =>
  queryOptions({
    queryKey: qk.cvrTemplates.picker(),
    queryFn: () => fetchCvrTemplatePickerItems(),
    staleTime: Infinity,
  });

/** Admin-side row: everything the admin dialog needs to render + edit. */
export type CvrTemplateAdminItem = CvrTemplateFieldSet & TemplateMeta;

export const fetchCvrTemplatesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput((): Promise<CvrTemplateAdminItem[]> => ops().admin()),
);

export const cvrTemplatesAdminQueryOptions = () =>
  queryOptions({
    queryKey: qk.cvrTemplates.admin(),
    queryFn: () => fetchCvrTemplatesAdmin(),
    staleTime: Infinity,
  });

export type UpsertCvrTemplateInput = UpsertTemplateInput<CvrTemplateFieldSet>;

export const upsertCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertCvrTemplate)
  .handler(adminHandler(({ data }) => ops().upsert(data)));

export const deleteCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(adminHandler(({ data }) => ops().remove(data.id)));

/**
 * Returns the full templatable field set for one template and increments
 * its usage counter in the same transaction. The dialog calls this from
 * the picker's onChange to populate the form; the user still reviews and
 * saves, so a fetched-but-abandoned instantiation does count as usage
 * (matches "the picker was used" semantics — Phase 2 sort uses this).
 *
 * Requires a signed-in user (any role passes — `USER` is the floor). The
 * doc comment used to claim "available to any signed-in user" without
 * enforcing it — an unauthenticated POST would still bump `usageCount`.
 * The downstream CVR upsert independently enforces project access, so this
 * guard exists purely to prevent anonymous callers from poisoning the
 * picker's usage-based sort order.
 */
export const instantiateCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseInstantiateCvrTemplate)
  .handler(async ({ data }): Promise<CvrTemplateFieldSet> => {
    await requireRole("USER");
    return ops().instantiate(data.id);
  });

/**
 * "Save current CVR as a new template" — Phase 2 quick action invoked from
 * the CVR dialog footer for admins. Snapshots the current form's
 * templatable fields under the given name + help text. Admin-only.
 */
export const saveAsCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertCvrTemplate)
  .handler(adminHandler(({ data }) => ops().saveAs(data)));
