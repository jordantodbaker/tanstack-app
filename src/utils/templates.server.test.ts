import { beforeEach, describe, expect, it } from "vitest";
import { templateOps, type UpsertTemplateInput } from "./templates.server";

/**
 * The template store shared by the CVR and FCO features.
 *
 * Both used to carry their own copy of these six operations; they now share
 * one, so a bug here breaks both at once. Testable without a database because
 * the Prisma delegate is a parameter — the fake below records what it was
 * asked for, which is the point: most of what these operations decide is the
 * shape of the query, not the shape of the answer.
 */

type Row = Record<string, unknown>;

/** The slice of a Prisma delegate the operations use, as an in-memory fake. */
function fakeDelegate(rows: Row[] = []) {
  const calls: { op: string; args: unknown }[] = [];
  let nextId = rows.length + 1;
  return {
    calls,
    rows,
    findMany: async (args?: unknown) => {
      calls.push({ op: "findMany", args });
      return rows;
    },
    create: async (args: { data: Row }) => {
      calls.push({ op: "create", args });
      const created = { id: nextId++, ...args.data };
      rows.push(created);
      return created as { id: number };
    },
    update: async (args: { where: { id: number }; data: Row }) => {
      calls.push({ op: "update", args });
      const row = rows.find((r) => r.id === args.where.id) ?? {};
      return { ...row, ...args.data };
    },
    delete: async (args: unknown) => {
      calls.push({ op: "delete", args });
      return {};
    },
  };
}

type Fields = { title: string; discipline: string; costImpact: number };
const FIELDS = ["title", "discipline", "costImpact"] as const;

const input = (over: Partial<UpsertTemplateInput<Fields>> = {}) => ({
  name: "Weather Delay",
  templateDescription: "Rain days",
  title: "Weather delay",
  discipline: "piping",
  costImpact: 1000,
  ...over,
});

let delegate: ReturnType<typeof fakeDelegate>;
let ops: ReturnType<typeof templateOps<Fields>>;
beforeEach(() => {
  delegate = fakeDelegate();
  ops = templateOps<Fields>(delegate, FIELDS);
});

describe("picker", () => {
  it("asks for the slim column set, most-used first", async () => {
    // Order is the feature: the picker leads with what people actually pick.
    // The select is slim on purpose — the long description and notes only
    // arrive once a template is chosen.
    await ops.picker();
    expect(delegate.calls[0].args).toMatchObject({
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        templateDescription: true,
        discipline: true,
        usageCount: true,
      },
    });
  });
});

describe("admin", () => {
  it("merges the meta columns with the templatable fields", async () => {
    delegate = fakeDelegate([
      {
        id: 7,
        name: "Weather Delay",
        templateDescription: "Rain days",
        usageCount: 3,
        title: "Weather delay",
        discipline: "piping",
        costImpact: 1000,
        // A column the admin dialog has no business seeing.
        createdAt: new Date(),
      },
    ]);
    const [row] = await templateOps<Fields>(delegate, FIELDS).admin();
    expect(row).toEqual({
      id: 7,
      name: "Weather Delay",
      templateDescription: "Rain days",
      usageCount: 3,
      title: "Weather delay",
      discipline: "piping",
      costImpact: 1000,
    });
  });

  it("sorts by name, since this list is browsed rather than picked", async () => {
    await ops.admin();
    expect(delegate.calls[0].args).toMatchObject({
      orderBy: { name: "asc" },
    });
  });
});

describe("upsert", () => {
  it("creates when there is no id", async () => {
    expect(await ops.upsert(input())).toEqual({ ok: true });
    expect(delegate.calls.map((c) => c.op)).toEqual(["create"]);
  });

  it("updates in place when there is one", async () => {
    // In place, so anything referencing the template keeps pointing at it.
    await ops.upsert(input({ id: 4 }));
    expect(delegate.calls[0]).toMatchObject({
      op: "update",
      args: { where: { id: 4 } },
    });
  });

  it("stores only the templatable fields", async () => {
    // A template is a subset of its feature's row — no identity, no status, no
    // workflow stamps. Anything extra arriving from the client is dropped.
    await ops.upsert({ ...input(), status: "APPROVED", projectId: 9 } as never);
    const { data } = delegate.calls[0].args as { data: Row };
    expect(Object.keys(data).sort()).toEqual([
      "costImpact",
      "discipline",
      "name",
      "templateDescription",
      "title",
    ]);
  });

  it("trims the name and the help text", async () => {
    await ops.upsert(
      input({ name: "  Weather Delay  ", templateDescription: " Rain " }),
    );
    const { data } = delegate.calls[0].args as { data: Row };
    expect(data.name).toBe("Weather Delay");
    expect(data.templateDescription).toBe("Rain");
  });

  it("lets the trimmed name win over a field list that claims it", async () => {
    // The explicit values are spread last for exactly this reason. A field
    // list that wrongly grows a "name" entry must not reinstate the untrimmed
    // value — the drift-guard tests should catch that first, but the write
    // should be safe regardless.
    const rogue = templateOps<Fields>(delegate, [...FIELDS, "name"] as never);
    await rogue.upsert(input({ name: "  Padded  " }));
    const { data } = delegate.calls[0].args as { data: Row };
    expect(data.name).toBe("Padded");
  });
});

describe("remove", () => {
  it("deletes by id and reports success", async () => {
    expect(await ops.remove(12)).toEqual({ ok: true });
    expect(delegate.calls[0]).toMatchObject({
      op: "delete",
      args: { where: { id: 12 } },
    });
  });
});

describe("instantiate", () => {
  it("counts the pick as a use in the same write", async () => {
    // One write, not a read then a write: the counter is what the most-used
    // sort runs on, and a separate read would race.
    await ops.instantiate(5);
    expect(delegate.calls).toHaveLength(1);
    expect(delegate.calls[0]).toMatchObject({
      op: "update",
      args: { where: { id: 5 }, data: { usageCount: { increment: 1 } } },
    });
  });

  it("returns the templatable fields and nothing else", async () => {
    delegate = fakeDelegate([
      {
        id: 5,
        name: "Weather Delay",
        usageCount: 2,
        title: "Weather delay",
        discipline: "piping",
        costImpact: 1000,
      },
    ]);
    const fields = await templateOps<Fields>(delegate, FIELDS).instantiate(5);
    // The form is populated from this; `name` and `usageCount` are not form
    // fields and would overwrite the user's own entry.
    expect(fields).toEqual({
      title: "Weather delay",
      discipline: "piping",
      costImpact: 1000,
    });
  });
});

describe("saveAs", () => {
  it("creates a new template and hands back its id", async () => {
    // The dialog needs the id to select what it just saved.
    const result = await ops.saveAs(input());
    expect(result).toEqual({ ok: true, id: 1 });
    expect(delegate.calls.map((c) => c.op)).toEqual(["create"]);
  });

  it("creates even when the input carries an id", async () => {
    // "Save as a new template" from a form that was loaded from one: the id
    // belongs to the source, and reusing it would overwrite it.
    await ops.saveAs(input({ id: 3 }));
    expect(delegate.calls[0].op).toBe("create");
  });
});
