import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  adminHandler,
  adminHandlerNoInput,
  requireRole,
} from "./users.server";
import {
  parseIdInput,
  parseUpsertFcoTemplate,
  parseInstantiateFcoTemplate,
} from "~/lib/validators";
import { pickFields } from "~/lib/pick";
import type { FcoOriginType, FcoPriority } from "./fcoLog";

/**
 * FCO templates — reusable scaffolds for repeat field changes. Mirrors
 * `cvrTemplates.ts` exactly; see that file's header for the design
 * rationale (templatable subset, usage-count sort, instantiation
 * semantics).
 */
export const FCO_TEMPLATE_FIELDS = [
  "title",
  "description",
  "originType",
  "priority",
  "discipline",
  "cbsCodes",
  "locationArea",
  "drawingRefs",
  "rfiNumbers",
  "initiatedBy",
  "fieldContact",
  "estimatedCost",
  "estimatedHours",
  "workStopped",
  "photosUrl",
  "reasonNarrative",
  "notes",
] as const;

export type FcoTemplateFieldSet = {
  title: string;
  description: string;
  originType: FcoOriginType;
  priority: FcoPriority;
  discipline: string;
  cbsCodes: string[];
  locationArea: string;
  drawingRefs: string[];
  rfiNumbers: string[];
  initiatedBy: string;
  fieldContact: string;
  estimatedCost: number;
  estimatedHours: number;
  workStopped: boolean;
  photosUrl: string;
  reasonNarrative: string;
  notes: string;
};

export type FcoTemplatePickerItem = {
  id: number;
  name: string;
  templateDescription: string;
  discipline: string;
  usageCount: number;
};

export const fetchFcoTemplatePickerItems = createServerFn({
  method: "GET",
}).handler(async (): Promise<FcoTemplatePickerItem[]> => {
  const rows = await prisma.fcoTemplate.findMany({
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

export const fcoTemplatePickerQueryOptions = () =>
  queryOptions({
    queryKey: ["fcoTemplatePicker"],
    queryFn: () => fetchFcoTemplatePickerItems(),
    staleTime: Infinity,
  });

export type FcoTemplateAdminItem = FcoTemplateFieldSet & {
  id: number;
  name: string;
  templateDescription: string;
  usageCount: number;
};

export const fetchFcoTemplatesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput(async (): Promise<FcoTemplateAdminItem[]> => {
    const rows = await prisma.fcoTemplate.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      templateDescription: r.templateDescription,
      usageCount: r.usageCount,
      ...(pickFields(r, FCO_TEMPLATE_FIELDS) as FcoTemplateFieldSet),
    }));
  }),
);

export const fcoTemplatesAdminQueryOptions = () =>
  queryOptions({
    queryKey: ["fcoTemplatesAdmin"],
    queryFn: () => fetchFcoTemplatesAdmin(),
    staleTime: Infinity,
  });

export type UpsertFcoTemplateInput = {
  id?: number;
  name: string;
  templateDescription: string;
} & FcoTemplateFieldSet;

/** The DB payload for a create/update — the templatable fields (derived from
 *  `FCO_TEMPLATE_FIELDS`) plus the trimmed name/description. Shared by
 *  `upsertFcoTemplate` and `saveAsFcoTemplate` so the field list lives once. */
const fcoTemplatePayload = (data: UpsertFcoTemplateInput) => ({
  name: data.name.trim(),
  templateDescription: data.templateDescription.trim(),
  ...pickFields(data, FCO_TEMPLATE_FIELDS),
});

export const upsertFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFcoTemplate)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const payload = fcoTemplatePayload(data);
      if (data.id) {
        await prisma.fcoTemplate.update({
          where: { id: data.id },
          data: payload,
        });
      } else {
        await prisma.fcoTemplate.create({ data: payload });
      }
      return { ok: true };
    }),
  );

export const deleteFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      await prisma.fcoTemplate.delete({ where: { id: data.id } });
      return { ok: true };
    }),
  );

/**
 * Fetches a template's field set and bumps its `usageCount`. Requires a
 * signed-in user (any role passes — `USER` is the floor). The downstream
 * FCO upsert independently enforces project access; this guard exists so
 * an anonymous caller can't poison the picker's usage-based sort. Matches
 * the same shape as `instantiateCvrTemplate`.
 */
export const instantiateFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseInstantiateFcoTemplate)
  .handler(async ({ data }): Promise<FcoTemplateFieldSet> => {
    await requireRole("USER");
    const row = await prisma.fcoTemplate.update({
      where: { id: data.id },
      data: { usageCount: { increment: 1 } },
    });
    return pickFields(row, FCO_TEMPLATE_FIELDS) as FcoTemplateFieldSet;
  });

export const saveAsFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFcoTemplate)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true; id: number }> => {
      const created = await prisma.fcoTemplate.create({
        data: fcoTemplatePayload(data),
      });
      return { ok: true, id: created.id };
    }),
  );
