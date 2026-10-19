import { pickFields } from "~/lib/pick";

/**
 * SERVER-ONLY. The CVR and FCO template stores, which are the same store.
 *
 * `cvrTemplates.ts` and `fcoTemplates.ts` were line-for-line identical apart
 * from their field lists, their Prisma delegate and their doc comments — the
 * second file's header said as much. Six operations were therefore written
 * twice, and had to be changed twice.
 *
 * Only the operations live here, NOT the server functions. `createServerFn`
 * identifies a function by its call site, so generating the pair from one
 * factory would risk both features resolving to a single RPC id — CVR calls
 * landing in the FCO handler. Each module keeps its own five call sites and
 * calls in here for the body.
 *
 * `.server.ts` because these are exported functions that touch `prisma`,
 * which is banned in a client-reachable module (see `no-prisma-in-client`):
 * the suffix is what keeps it out of the client graph.
 */

/** What the dialog's picker shows before a template is chosen. */
export type TemplatePickerItem = {
  id: number;
  name: string;
  templateDescription: string;
  discipline: string;
  usageCount: number;
};

/** The non-templatable columns every template row carries. */
export type TemplateMeta = {
  id: number;
  name: string;
  templateDescription: string;
  usageCount: number;
};

/** A create/update payload: the templatable fields plus the name and help text. */
export type UpsertTemplateInput<Fields> = {
  id?: number;
  name: string;
  templateDescription: string;
} & Fields;

/**
 * The slice of a Prisma model delegate these operations use.
 *
 * Loosely typed for the same reason `requireRecordAccess` is: the generated
 * delegates are overloaded per-`select`, and a precise signature fights that
 * narrowing. The looseness is sealed inside this file — callers stay typed
 * through the `Fields` generic.
 */
type TemplateDelegate = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany: (args?: any) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (args: any) => Promise<{ id: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: (args: any) => Promise<unknown>;
};

/**
 * The six template operations, bound to one model and its templatable fields.
 *
 * Returns plain async functions. Call this from inside a handler body rather
 * than at module scope: a module-level `prisma.x` reference in a
 * client-reachable file survives the client transform, which is the leak the
 * `.server.ts` suffix and the handler-only rule exist to prevent.
 */
export function templateOps<Fields>(
  delegate: TemplateDelegate,
  fields: readonly (keyof Fields & string)[],
) {
  /**
   * The templatable fields plus the trimmed name/description.
   *
   * The explicit two come last so the trimmed values win. `fields` never
   * contains them — a drift-guard test per feature asserts the field list is a
   * strict subset of the row's other columns — but ordering it this way means
   * the trim cannot be undone by a field list that grows wrong.
   */
  const payload = (data: UpsertTemplateInput<Fields>) => ({
    ...(pickFields(data, fields) as Fields),
    name: data.name.trim(),
    templateDescription: data.templateDescription.trim(),
  });

  return {
    /** Most-used first, so the picker leads with what people actually pick. */
    async picker(): Promise<TemplatePickerItem[]> {
      return delegate.findMany({
        select: {
          id: true,
          name: true,
          templateDescription: true,
          discipline: true,
          usageCount: true,
        },
        orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      });
    },

    /** Everything the admin dialog needs to render and edit. */
    async admin(): Promise<(Fields & TemplateMeta)[]> {
      const rows = await delegate.findMany({ orderBy: { name: "asc" } });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        templateDescription: r.templateDescription,
        usageCount: r.usageCount,
        ...(pickFields(r, fields) as Fields),
      }));
    },

    async upsert(data: UpsertTemplateInput<Fields>): Promise<{ ok: true }> {
      const next = payload(data);
      if (data.id) {
        await delegate.update({ where: { id: data.id }, data: next });
      } else {
        await delegate.create({ data: next });
      }
      return { ok: true };
    },

    async remove(id: number): Promise<{ ok: true }> {
      await delegate.delete({ where: { id } });
      return { ok: true };
    },

    /**
     * One template's field set, counting the pick as a use in the same write.
     *
     * The bump is deliberately not conditional on the caller going on to save:
     * the counter means "the picker was used", which is what the most-used
     * sort wants.
     */
    async instantiate(id: number): Promise<Fields> {
      const row = await delegate.update({
        where: { id },
        data: { usageCount: { increment: 1 } },
      });
      return pickFields(row, fields) as Fields;
    },

    async saveAs(
      data: UpsertTemplateInput<Fields>,
    ): Promise<{ ok: true; id: number }> {
      const created = await delegate.create({ data: payload(data) });
      return { ok: true, id: created.id };
    },
  };
}
