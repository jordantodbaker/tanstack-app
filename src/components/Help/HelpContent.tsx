import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";
import type {
  HelpBlock,
  HelpSection,
  WorkflowEntity,
} from "~/config/help-guide";
import {
  CVR_TRANSITIONS,
  FCO_TRANSITIONS,
  PCO_TRANSITIONS,
  RFI_TRANSITIONS,
  TREND_TRANSITIONS,
  availableTransitions,
  type Transition,
} from "~/utils/workflow";
import { STATUS_LABELS } from "~/utils/changelogLabels";
import { FCO_STATUS_LABELS } from "~/utils/fcoLogLabels";
import { RFI_STATUS_LABELS } from "~/utils/rfiLabels";
import { TREND_STATUS_LABELS } from "~/utils/trendLabels";
import { PCO_STATUS_LABELS } from "~/utils/pcoLabels";
import type { UserRole } from "~/utils/users";

/**
 * Renders the guide's block content. Shared by the help dialog and the
 * `/help` route so the two can never drift; see `~/config/help-guide.ts`
 * for the content itself and `~/lib/help-visibility.ts` for role filtering.
 *
 * Everything here is presentational except the `workflow` block, which reads
 * the real transition maps so the lifecycle tables show what *this* reader
 * may actually do rather than a hand-maintained copy that goes stale.
 */

/**
 * Loosened view of a transition map. The real maps are each keyed to their
 * own status enum; the table only ever reads `action` / `minRole` and prints
 * the key, so one string-keyed shape covers all five.
 */
type AnyTransitions = Record<string, Transition<string>[]>;

const WORKFLOWS: Record<
  WorkflowEntity,
  { label: string; transitions: AnyTransitions; labels: Record<string, string> }
> = {
  cvr: {
    label: "CVR",
    transitions: CVR_TRANSITIONS as AnyTransitions,
    labels: STATUS_LABELS,
  },
  fco: {
    label: "FCO",
    transitions: FCO_TRANSITIONS as AnyTransitions,
    labels: FCO_STATUS_LABELS,
  },
  rfi: {
    label: "RFI",
    transitions: RFI_TRANSITIONS as AnyTransitions,
    labels: RFI_STATUS_LABELS,
  },
  trend: {
    label: "Trend",
    transitions: TREND_TRANSITIONS as AnyTransitions,
    labels: TREND_STATUS_LABELS,
  },
  pco: {
    label: "PCO",
    transitions: PCO_TRANSITIONS as AnyTransitions,
    labels: PCO_STATUS_LABELS,
  },
};

/**
 * Lifecycle table for one register, filtered to the reader's privilege.
 *
 * `isOriginator` is passed as false: the guide describes what the role can
 * do in general, and the self-sign-off restriction is called out by the
 * dagger footnote rather than by hiding rows the reader would otherwise see
 * on someone else's record.
 */
function WorkflowTable({
  entity,
  role,
}: {
  entity: WorkflowEntity;
  role: UserRole;
}) {
  const { label, transitions, labels } = WORKFLOWS[entity];
  const statuses = Object.keys(transitions);

  const rows = statuses.map((status) => ({
    status,
    actions: availableTransitions(transitions, status, role, false),
  }));
  const hasOriginatorBlock = rows.some((r) =>
    r.actions.some((a) => a.blockOriginator),
  );

  return (
    <div className="my-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {label} lifecycle — what you can do
      </p>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions available</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ status, actions }) => (
              <tr key={status} className="border-t border-slate-200">
                <td className="px-3 py-2 align-top font-medium whitespace-nowrap text-slate-700">
                  {labels[status] ?? status}
                </td>
                <td className="px-3 py-2 align-top text-slate-600">
                  {actions.length === 0 ? (
                    <span className="text-slate-400">
                      {transitions[status].length === 0
                        ? "Final state — no further actions"
                        : "Nothing available at your access level"}
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {actions.map((a) => (
                        <span
                          key={a.action}
                          className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700"
                        >
                          {a.action}
                          {a.blockOriginator && (
                            <span className="ml-0.5 text-slate-400">†</span>
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasOriginatorBlock && (
        <p className="mt-1.5 text-xs text-slate-500">
          † Not available on a record you raised yourself — someone else has to
          action it.
        </p>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-600">
      {children}
    </kbd>
  );
}

function Block({ block, role }: { block: HelpBlock; role: UserRole }) {
  switch (block.kind) {
    case "p":
      return <p className="my-3 text-sm text-slate-600">{block.text}</p>;

    case "ul":
      return (
        <ul className="my-3 space-y-1.5 text-sm text-slate-600">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-slate-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="my-3 space-y-2 text-sm text-slate-600">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case "keys":
      return (
        <div className="my-3 overflow-hidden rounded-md border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <tbody>
              {block.rows.map((row, i) => (
                <tr
                  key={i}
                  className={i > 0 ? "border-t border-slate-200" : undefined}
                >
                  <td className="w-px px-3 py-2 align-top whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {row.keys.map((key, k) => (
                        <React.Fragment key={k}>
                          {k > 0 && (
                            <span className="text-xs text-slate-300">+</span>
                          )}
                          <Kbd>{key}</Kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle text-slate-600">
                    {row.what}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "note": {
      const warn = block.tone === "warn";
      const Icon = warn ? TriangleAlert : Info;
      return (
        <div
          className={`my-3 flex gap-2.5 rounded-md border p-3 text-sm ${
            warn
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-sky-200 bg-sky-50 text-sky-900"
          }`}
        >
          <Icon
            size={16}
            className={`mt-0.5 shrink-0 ${warn ? "text-amber-500" : "text-sky-500"}`}
          />
          <span>{block.text}</span>
        </div>
      );
    }

    case "image":
      return (
        <figure className="my-4">
          <img
            src={block.src}
            alt={block.alt}
            loading="lazy"
            className="w-full rounded-md border border-slate-200 shadow-sm"
          />
          {block.caption && (
            <figcaption className="mt-1.5 text-xs text-slate-500">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "workflow":
      return <WorkflowTable entity={block.entity} role={role} />;
  }
}

/**
 * One section and its subsections. `depth` drives heading weight only —
 * the content tree is at most two levels (see `help-guide.ts`).
 */
export function HelpSectionView({
  section,
  role,
  depth = 0,
}: {
  section: HelpSection;
  role: UserRole;
  depth?: number;
}) {
  return (
    <section
      id={`help-${section.id}`}
      data-help-section={section.id}
      className={depth === 0 ? "scroll-mt-4 pt-6 first:pt-0" : "scroll-mt-4 pt-5"}
    >
      {depth === 0 ? (
        <h2 className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">
          {section.title}
        </h2>
      ) : (
        <h3 className="text-sm font-semibold text-slate-800">
          {section.title}
        </h3>
      )}

      {section.blocks.map((block, i) => (
        <Block key={i} block={block} role={role} />
      ))}

      {section.subsections?.map((sub) => (
        <HelpSectionView
          key={sub.id}
          section={sub}
          role={role}
          depth={depth + 1}
        />
      ))}
    </section>
  );
}

/** The whole (already filtered) guide body. */
export function HelpContent({
  sections,
  role,
}: {
  sections: HelpSection[];
  role: UserRole;
}) {
  if (sections.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Nothing in the guide matches that search.
      </p>
    );
  }
  return (
    <>
      {sections.map((section) => (
        <HelpSectionView key={section.id} section={section} role={role} />
      ))}
    </>
  );
}
