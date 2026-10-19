import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import { adminHandler, adminHandlerNoInput, requireRole } from "./users.server";
import {
  parseIdInput,
  parseUpsertFcoTemplate,
  parseInstantiateFcoTemplate,
} from "~/lib/validators";
import {
  templateOps,
  type TemplateMeta,
  type TemplatePickerItem,
  type UpsertTemplateInput,
} from "./templates.server";
import type { FcoOriginType, FcoPriority } from "./fcoLog";

/**
 * FCO templates — reusable scaffolds for repeat field changes. Mirrors
 * `cvrTemplates.ts`; see that file's header for the design rationale
 * (templatable subset, usage-count sort, instantiation semantics).
 *
 * The two differ only in this field set and the model they write, which is
 * why the six operations live in `templates.server.ts`. The server functions
 * stay here: `createServerFn` identifies one by its call site, so sharing
 * them would risk both features answering on a single RPC id.
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

/** Built inside each handler, for the reason given in `cvrTemplates.ts`. */
const ops = () =>
  templateOps<FcoTemplateFieldSet>(prisma.fcoTemplate, FCO_TEMPLATE_FIELDS);

export type FcoTemplatePickerItem = TemplatePickerItem;

export const fetchFcoTemplatePickerItems = createServerFn({
  method: "GET",
}).handler((): Promise<FcoTemplatePickerItem[]> => ops().picker());

export const fcoTemplatePickerQueryOptions = () =>
  queryOptions({
    queryKey: qk.fcoTemplates.picker(),
    queryFn: () => fetchFcoTemplatePickerItems(),
    staleTime: Infinity,
  });

export type FcoTemplateAdminItem = FcoTemplateFieldSet & TemplateMeta;

export const fetchFcoTemplatesAdmin = createServerFn({ method: "GET" }).handler(
  adminHandlerNoInput((): Promise<FcoTemplateAdminItem[]> => ops().admin()),
);

export const fcoTemplatesAdminQueryOptions = () =>
  queryOptions({
    queryKey: qk.fcoTemplates.admin(),
    queryFn: () => fetchFcoTemplatesAdmin(),
    staleTime: Infinity,
  });

export type UpsertFcoTemplateInput = UpsertTemplateInput<FcoTemplateFieldSet>;

export const upsertFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFcoTemplate)
  .handler(adminHandler(({ data }) => ops().upsert(data)));

export const deleteFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(adminHandler(({ data }) => ops().remove(data.id)));

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
    return ops().instantiate(data.id);
  });

export const saveAsFcoTemplate = createServerFn({ method: "POST" })
  .inputValidator(parseUpsertFcoTemplate)
  .handler(adminHandler(({ data }) => ops().saveAs(data)));
