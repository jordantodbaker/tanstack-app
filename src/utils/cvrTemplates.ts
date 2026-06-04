import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  adminHandler,
  adminHandlerNoInput,
} from "./users.server";
import {
  parseIdInput,
  parseUpsertCvrTemplate,
  parseInstantiateCvrTemplate,
} from "~/lib/validators";
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
 * Picker payload shown in the dialog. Slim — drops `notes` and the longer
 * `description` until the user actually selects the template. The full
 * field set arrives via `instantiateCvrTemplate`, which is what populates
 * the form.
 */
export type CvrTemplatePickerItem = {
  id: number;
  name: string;
  templateDescription: string;
  discipline: string;
  usageCount: number;
};

export const fetchCvrTemplatePickerItems = createServerFn({
  method: "GET",
}).handler(async (): Promise<CvrTemplatePickerItem[]> => {
  const rows = await prisma.cvrTemplate.findMany({
    select: {
      id: true,
      name: true,
      templateDescription: true,
      discipline: true,
      usageCount: true,
    },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });
  return rows;
});

export const cvrTemplatePickerQueryOptions = () =>
  queryOptions({
    queryKey: ["cvrTemplatePicker"],
    queryFn: () => fetchCvrTemplatePickerItems(),
    staleTime: Infinity,
  });

/** Admin-side row: everything the admin dialog needs to render + edit. */
export type CvrTemplateAdminItem = CvrTemplateFieldSet & {
  id: number;
  name: string;
  templateDescription: string;
  usageCount: number;
};

export const fetchCvrTemplatesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<CvrTemplateAdminItem[]> => {
    const rows = await prisma.cvrTemplate.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      templateDescription: r.templateDescription,
      title: r.title,
      description: r.description,
      type: r.type as ChangeType,
      discipline: r.discipline,
      cbsCodes: r.cbsCodes,
      originator: r.originator,
      costImpact: r.costImpact,
      scheduleDaysImpact: r.scheduleDaysImpact,
      laborHoursImpact: r.laborHoursImpact,
      riskLevel: r.riskLevel as RiskLevel,
      reasonCode: r.reasonCode,
      notes: r.notes,
      area: r.area,
      usageCount: r.usageCount,
    }));
  }),
);

export const cvrTemplatesAdminQueryOptions = () =>
  queryOptions({
    queryKey: ["cvrTemplatesAdmin"],
    queryFn: () => fetchCvrTemplatesAdmin(),
    staleTime: Infinity,
  });

export type UpsertCvrTemplateInput = {
  id?: number;
  name: string;
  templateDescription: string;
} & CvrTemplateFieldSet;

export const upsertCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertCvrTemplate)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const payload = {
        name: data.name.trim(),
        templateDescription: data.templateDescription.trim(),
        title: data.title,
        description: data.description,
        type: data.type,
        discipline: data.discipline,
        cbsCodes: data.cbsCodes,
        originator: data.originator,
        costImpact: data.costImpact,
        scheduleDaysImpact: data.scheduleDaysImpact,
        laborHoursImpact: data.laborHoursImpact,
        riskLevel: data.riskLevel,
        reasonCode: data.reasonCode,
        notes: data.notes,
        area: data.area,
      };
      if (data.id) {
        await prisma.cvrTemplate.update({
          where: { id: data.id },
          data: payload,
        });
      } else {
        await prisma.cvrTemplate.create({ data: payload });
      }
      return { ok: true };
    }),
  );

export const deleteCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.cvrTemplate.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

/**
 * Returns the full templatable field set for one template and increments
 * its usage counter in the same transaction. The dialog calls this from
 * the picker's onChange to populate the form; the user still reviews and
 * saves, so a fetched-but-abandoned instantiation does count as usage
 * (matches "the picker was used" semantics — Phase 2 sort uses this).
 *
 * Available to any signed-in user; templates aren't sensitive and the
 * downstream CVR upsert still enforces project access.
 */
export const instantiateCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseInstantiateCvrTemplate)
  .handler(async ({ data }): Promise<CvrTemplateFieldSet> => {
    const row = await prisma.cvrTemplate.update({
      where: { id: data.id },
      data: { usageCount: { increment: 1 } },
    });
    return {
      title: row.title,
      description: row.description,
      type: row.type as ChangeType,
      discipline: row.discipline,
      cbsCodes: row.cbsCodes,
      originator: row.originator,
      costImpact: row.costImpact,
      scheduleDaysImpact: row.scheduleDaysImpact,
      laborHoursImpact: row.laborHoursImpact,
      riskLevel: row.riskLevel as RiskLevel,
      reasonCode: row.reasonCode,
      notes: row.notes,
      area: row.area,
    };
  });

/**
 * "Save current CVR as a new template" — Phase 2 quick action invoked from
 * the CVR dialog footer for admins. Snapshots the current form's
 * templatable fields under the given name + help text. Admin-only.
 */
export const saveAsCvrTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertCvrTemplate)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true; id: number }> => {
      const created = await prisma.cvrTemplate.create({
        data: {
          name: data.name.trim(),
          templateDescription: data.templateDescription.trim(),
          title: data.title,
          description: data.description,
          type: data.type,
          discipline: data.discipline,
          cbsCodes: data.cbsCodes,
          originator: data.originator,
          costImpact: data.costImpact,
          scheduleDaysImpact: data.scheduleDaysImpact,
          laborHoursImpact: data.laborHoursImpact,
          riskLevel: data.riskLevel,
          reasonCode: data.reasonCode,
          notes: data.notes,
          area: data.area,
        },
      });
      return { ok: true, id: created.id };
    }),
  );
