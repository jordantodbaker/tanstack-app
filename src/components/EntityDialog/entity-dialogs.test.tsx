// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Behavior shared by the five change-record dialogs (CVR, FCO, RFI, Trend,
 * PCO), pinned before their common setup is factored out:
 *
 * - create mode opens on a blank form; edit mode loads the full record,
 * - Save hands the form to `onSubmit` and closes the dialog,
 * - a failed save says why and leaves the dialog open,
 * - Delete asks first, then hands the id to `onDelete` and closes,
 * - opening a record logs one "recently viewed" entry.
 *
 * Server functions never run: `createServerFn` is stubbed so every fetch the
 * dialogs make resolves to an empty list, and the full record is seeded into
 * the query cache under the dialog's own key.
 */

const { recordRecentView } = vi.hoisted(() => ({
  recordRecentView: vi.fn(async (_args: unknown) => undefined),
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  // Any chain of builder calls ends in a callable that resolves to [].
  const builder = (): unknown =>
    new Proxy(async () => [], {
      get: (_t, prop) => (prop === "then" ? undefined : () => builder()),
    });
  return { ...actual, createServerFn: () => builder() };
});

vi.mock("~/utils/userPreferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/userPreferences")>()),
  recordRecentView,
}));

// The CVR dialog reads the project from the header rather than a prop.
vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({
    projectId: 1,
    setProjectId: vi.fn(),
    isHydrated: true,
  }),
}));

import { PcoDialog } from "~/components/Pco/PcoDialog";
import { RfiDialog } from "~/components/Rfi/RfiDialog";
import { TrendDialog } from "~/components/Trend/TrendDialog";
import { FcoDialog } from "~/components/FCOLog/FcoDialog";
import { ChangelogDialog } from "~/components/Changelog/ChangelogDialog";
import { pcoQueryOptions, type PcoItem } from "~/utils/pco";
import { rfiQueryOptions, type RfiItem } from "~/utils/rfis";
import { trendQueryOptions, type TrendItem } from "~/utils/trends";
import { fcoQueryOptions, type FcoItem } from "~/utils/fcoLog";
import {
  changeLogQueryOptions,
  type ChangeLogDetail,
} from "~/utils/changelog";

afterEach(cleanup);

// happy-dom has no window.confirm; the dialogs call the global.
const confirmSpy = vi.fn((_message?: string) => true);
vi.stubGlobal("confirm", confirmSpy);
beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockReturnValue(true);
});

const STAMP = "2026-10-01T00:00:00.000Z";

/** One dialog under test, described just enough to drive it generically. */
type Case = {
  name: string;
  /** The full record, seeded under the dialog's full-record query key. */
  record: { id: number; projectId: number };
  seed: (qc: QueryClient) => void;
  /** The form field holding the record's title, its label, and its value. */
  titleField: string;
  titleLabel: string;
  title: string;
  /** What "recently viewed" is told. */
  recent: { entityType: string; number: string };
  editHeading: string;
  newHeading: string;
  saveLabel: string;
  createLabel: string;
  render: (props: {
    initial?: never;
    onSubmit: (form: unknown) => Promise<unknown>;
    onDelete: (id: number) => Promise<unknown>;
  }) => React.ReactElement;
};

const trigger = <button type="button">Open</button>;
const common = { projectId: 1, status: "DRAFT", createdAt: STAMP, updatedAt: STAMP };

const pco = {
  ...common,
  id: 41,
  pcoNumber: "PCO-041",
  ownerReference: "",
  title: "Added pipe rack",
  priority: "NORMAL",
  requestedAmount: 1000,
  approvedAmount: 0,
  scheduleDaysImpact: 0,
  ownerRepName: "",
  ownerRepEmail: "",
  submittedAt: null,
  approvedAt: null,
  invoicedAt: null,
  invoiceNumber: "",
  paidAt: null,
  closedAt: null,
  initiatedBy: "",
  createdById: null,
  linkedCvrs: [],
  description: "",
  reasonNarrative: "",
  notes: "",
} as unknown as PcoItem;

const rfi = {
  ...common,
  id: 42,
  rfiNumber: "RFI-042",
  subject: "Clash at grid C4",
  question: "Which elevation governs?",
  priority: "NORMAL",
  discipline: "piping",
  cbsCodes: [],
  locationArea: "",
  drawingRefs: [],
  specRefs: [],
  suspectsCostImpact: false,
  suspectsScheduleImpact: false,
  initiatedBy: "",
  assignedTo: "",
  dueDate: null,
  initiatedAt: STAMP,
  response: "",
  answeredBy: "",
  linkedFcos: [],
} as unknown as RfiItem;

const trend = {
  ...common,
  id: 43,
  status: "IDENTIFIED",
  trendNumber: "TR-043",
  title: "Steel price drift",
  description: "",
  priority: "NORMAL",
  discipline: "steel",
  cbsCodes: [],
  locationArea: "",
  probability: 50,
  costLow: 0,
  costLikely: 0,
  costHigh: 0,
  scheduleDaysImpact: 0,
  reasonNarrative: "",
  notes: "",
  identifiedAt: STAMP,
  neededBy: null,
  linkedRfiId: null,
  linkedFcoId: null,
  linkedCvrId: null,
  initiatedBy: "",
  createdById: null,
} as unknown as TrendItem;

const fco = {
  ...common,
  id: 44,
  fcoNumber: "FCO-044",
  title: "Reroute drain line",
  description: "",
  originType: "FIELD_CONDITION",
  priority: "NORMAL",
  discipline: "piping",
  cbsCodes: [],
  locationArea: "",
  drawingRefs: [],
  rfiNumbers: [],
  initiatedBy: "",
  fieldContact: "",
  estimatedCost: 0,
  estimatedHours: 0,
  workStopped: false,
  photosUrl: "",
  reasonNarrative: "",
  resolution: "",
  notes: "",
  initiatedAt: STAMP,
  neededBy: null,
  closedAt: null,
  linkedCvrId: null,
  linkedCvrNumber: null,
  linkedCvrTitle: null,
  linkedRfiId: null,
  linkedRfiNumber: null,
  linkedRfiSubject: null,
  createdById: null,
} as unknown as FcoItem;

const cvr = {
  ...common,
  id: 45,
  status: "REQUESTED",
  cvrNumber: "CVR-045",
  title: "Owner-added valve",
  description: "",
  type: "SCOPE",
  discipline: "piping",
  cbsCodes: [],
  originator: "",
  costImpact: 0,
  scheduleDaysImpact: 0,
  laborHoursImpact: 0,
  riskLevel: "MEDIUM",
  reasonCode: "",
  requestedAt: STAMP,
  dueDate: null,
  approvedAt: null,
  approver: "",
  notes: "",
  area: "",
  lineItems: [],
  createdById: null,
} as unknown as ChangeLogDetail;

const CASES: Case[] = [
  {
    name: "PcoDialog",
    record: pco,
    seed: (qc) => qc.setQueryData(pcoQueryOptions(pco.id).queryKey, pco),
    titleField: "title",
    titleLabel: "Title",
    title: pco.title,
    recent: { entityType: "Pco", number: pco.pcoNumber },
    editHeading: "Edit PCO",
    newHeading: "New PCO",
    saveLabel: "Save",
    createLabel: "Create",
    render: (p) => <PcoDialog trigger={trigger} projectId={1} {...p} />,
  },
  {
    name: "RfiDialog",
    record: rfi,
    seed: (qc) => qc.setQueryData(rfiQueryOptions(rfi.id).queryKey, rfi),
    titleField: "subject",
    titleLabel: "Subject",
    title: rfi.subject,
    recent: { entityType: "Rfi", number: rfi.rfiNumber },
    editHeading: "Edit RFI",
    newHeading: "New RFI",
    saveLabel: "Save",
    createLabel: "Create",
    render: (p) => <RfiDialog trigger={trigger} projectId={1} {...p} />,
  },
  {
    name: "TrendDialog",
    record: trend,
    seed: (qc) => qc.setQueryData(trendQueryOptions(trend.id).queryKey, trend),
    titleField: "title",
    titleLabel: "Title",
    title: trend.title,
    recent: { entityType: "Trend", number: trend.trendNumber },
    editHeading: "Edit Trend",
    newHeading: "New Trend",
    saveLabel: "Save",
    createLabel: "Create",
    render: (p) => <TrendDialog trigger={trigger} projectId={1} {...p} />,
  },
  {
    name: "FcoDialog",
    record: fco,
    seed: (qc) => qc.setQueryData(fcoQueryOptions(fco.id).queryKey, fco),
    titleField: "title",
    titleLabel: "Title",
    title: fco.title,
    recent: { entityType: "FieldChangeOrder", number: fco.fcoNumber },
    editHeading: "Edit Field Change Order",
    newHeading: "New Field Change Order",
    saveLabel: "Save Changes",
    createLabel: "Create FCO",
    render: (p) => <FcoDialog trigger={trigger} projectId={1} {...p} />,
  },
  {
    name: "ChangelogDialog",
    record: cvr,
    seed: (qc) =>
      qc.setQueryData(changeLogQueryOptions(cvr.id).queryKey, cvr),
    titleField: "title",
    titleLabel: "Title",
    title: cvr.title,
    recent: { entityType: "ChangeLog", number: cvr.cvrNumber },
    editHeading: "Edit Change Item",
    newHeading: "New Change Item",
    saveLabel: "Save Changes",
    createLabel: "Create",
    render: (p) => <ChangelogDialog trigger={trigger} {...p} />,
  },
];

function mount(c: Case, mode: "edit" | "new") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  c.seed(qc);
  const onSubmit = vi.fn(async (_form: unknown) => undefined);
  const onDelete = vi.fn(async (_id: number) => undefined);
  render(
    <QueryClientProvider client={qc}>
      {c.render({
        initial: (mode === "edit" ? c.record : undefined) as never,
        onSubmit,
        onDelete,
      })}
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  return { onSubmit, onDelete };
}

const dialogOpen = () => screen.queryByRole("dialog") !== null;
const heading = (name: string) =>
  screen.findByRole("heading", { name: new RegExp(`^${name}$`) });

describe.each(CASES)("$name", (c) => {
  it("opens a record in edit mode, seeded from the full record", async () => {
    mount(c, "edit");
    expect(await heading(c.editHeading)).toBeInTheDocument();
    expect(screen.getByLabelText(c.titleLabel)).toHaveValue(c.title);
  });

  it("opens blank in create mode", async () => {
    mount(c, "new");
    expect(await heading(c.newHeading)).toBeInTheDocument();
    expect(screen.getByLabelText(c.titleLabel)).toHaveValue("");
    // Nothing to delete yet.
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("saves the edited form and closes", async () => {
    const { onSubmit } = mount(c, "edit");
    await heading(c.editHeading);
    fireEvent.change(screen.getByLabelText(c.titleLabel), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: c.saveLabel }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      id: c.record.id,
      [c.titleField]: "Renamed",
    });
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it("creates from the blank form and closes", async () => {
    const { onSubmit } = mount(c, "new");
    await heading(c.newHeading);
    fireEvent.change(screen.getByLabelText(c.titleLabel), {
      target: { value: "Brand new" },
    });
    fireEvent.click(screen.getByRole("button", { name: c.createLabel }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const form = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(form[c.titleField]).toBe("Brand new");
    expect(form.id).toBeUndefined();
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it("shows why a save failed and stays open", async () => {
    const { onSubmit } = mount(c, "edit");
    onSubmit.mockRejectedValueOnce(new Error("Title already used"));
    await heading(c.editHeading);
    fireEvent.click(screen.getByRole("button", { name: c.saveLabel }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Title already used",
    );
    expect(dialogOpen()).toBe(true);
    // Usable again: a retry that succeeds closes it.
    fireEvent.click(screen.getByRole("button", { name: c.saveLabel }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it("confirms, deletes by id and closes", async () => {
    const { onDelete } = mount(c, "edit");
    await heading(c.editHeading);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(c.record.id));
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it("does not delete when the confirm is declined", async () => {
    const { onDelete } = mount(c, "edit");
    confirmSpy.mockReturnValue(false);
    await heading(c.editHeading);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
  });

  it("logs one recent view when a record opens", async () => {
    mount(c, "edit");
    await heading(c.editHeading);
    await waitFor(() => expect(recordRecentView).toHaveBeenCalledTimes(1));
    expect(recordRecentView).toHaveBeenCalledWith({
      data: {
        entityType: c.recent.entityType,
        entityId: c.record.id,
        projectId: c.record.projectId,
        number: c.recent.number,
        title: c.title,
      },
    });
  });

  it("logs no recent view for a new record", async () => {
    mount(c, "new");
    await heading(c.newHeading);
    expect(recordRecentView).not.toHaveBeenCalled();
  });
});
