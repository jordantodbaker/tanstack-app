import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import {
  adminHandler,
  adminHandlerNoInput,
} from "./users.server";
import {
  parseIdInput,
  parseUpsertFcoTemplate,
  parseInstantiateFcoTemplate,
} from "~/lib/validators";
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
      title: r.title,
      description: r.description,
      originType: r.originType as FcoOriginType,
      priority: r.priority as FcoPriority,
      discipline: r.discipline,
      cbsCodes: r.cbsCodes,
      locationArea: r.locationArea,
      drawingRefs: r.drawingRefs,
      rfiNumbers: r.rfiNumbers,
      initiatedBy: r.initiatedBy,
      fieldContact: r.fieldContact,
      estimatedCost: r.estimatedCost,
      estimatedHours: r.estimatedHours,
      workStopped: r.workStopped,
      photosUrl: r.photosUrl,
      reasonNarrative: r.reasonNarrative,
      notes: r.notes,
      usageCount: r.usageCount,
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

export const upsertFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFcoTemplate)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true }> => {
      const payload = {
        name: data.name.trim(),
        templateDescription: data.templateDescription.trim(),
        title: data.title,
        description: data.description,
        originType: data.originType,
        priority: data.priority,
        discipline: data.discipline,
        cbsCodes: data.cbsCodes,
        locationArea: data.locationArea,
        drawingRefs: data.drawingRefs,
        rfiNumbers: data.rfiNumbers,
        initiatedBy: data.initiatedBy,
        fieldContact: data.fieldContact,
        estimatedCost: data.estimatedCost,
        estimatedHours: data.estimatedHours,
        workStopped: data.workStopped,
        photosUrl: data.photosUrl,
        reasonNarrative: data.reasonNarrative,
        notes: data.notes,
      };
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

export const instantiateFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseInstantiateFcoTemplate)
  .handler(async ({ data }): Promise<FcoTemplateFieldSet> => {
    const row = await prisma.fcoTemplate.update({
      where: { id: data.id },
      data: { usageCount: { increment: 1 } },
    });
    return {
      title: row.title,
      description: row.description,
      originType: row.originType as FcoOriginType,
      priority: row.priority as FcoPriority,
      discipline: row.discipline,
      cbsCodes: row.cbsCodes,
      locationArea: row.locationArea,
      drawingRefs: row.drawingRefs,
      rfiNumbers: row.rfiNumbers,
      initiatedBy: row.initiatedBy,
      fieldContact: row.fieldContact,
      estimatedCost: row.estimatedCost,
      estimatedHours: row.estimatedHours,
      workStopped: row.workStopped,
      photosUrl: row.photosUrl,
      reasonNarrative: row.reasonNarrative,
      notes: row.notes,
    };
  });

export const saveAsFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFcoTemplate)
  .handler(
    adminHandler(async ({ data }): Promise<{ ok: true; id: number }> => {
      const created = await prisma.fcoTemplate.create({
        data: {
          name: data.name.trim(),
          templateDescription: data.templateDescription.trim(),
          title: data.title,
          description: data.description,
          originType: data.originType,
          priority: data.priority,
          discipline: data.discipline,
          cbsCodes: data.cbsCodes,
          locationArea: data.locationArea,
          drawingRefs: data.drawingRefs,
          rfiNumbers: data.rfiNumbers,
          initiatedBy: data.initiatedBy,
          fieldContact: data.fieldContact,
          estimatedCost: data.estimatedCost,
          estimatedHours: data.estimatedHours,
          workStopped: data.workStopped,
          photosUrl: data.photosUrl,
          reasonNarrative: data.reasonNarrative,
          notes: data.notes,
        },
      });
      return { ok: true, id: created.id };
    }),
  );
