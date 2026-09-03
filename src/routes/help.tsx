import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HelpContent } from "~/components/Help/HelpContent";
import {
  GuideSearchBox,
  guideContentsRowClass,
  useHelpGuide,
} from "~/components/Help/help-guide-shell";
import { useCurrentUser } from "~/lib/use-current-user";
import { ROLE_LABELS } from "~/utils/users";

/**
 * The full-page guide. Same content and role filtering as the header's help
 * dialog (`HelpButton` → `HelpDialog`), rendered wide with real anchors so a
 * section can be linked or printed: `/help#take-off`.
 *
 * Deliberately outside `ProjectGuard` (see `__root.tsx`) — someone who can't
 * get past the guard is exactly the person reaching for the guide.
 */
export const Route = createFileRoute("/help")({
  component: HelpPage,
});

function HelpPage() {
  const { data: user } = useCurrentUser();
  const { role, query, setQuery, sections, contents } = useHelpGuide();

  // Honour the `#section` in the URL once the (role-filtered) content is on
  // the page. Runs on every section change so a search that re-renders the
  // body doesn't strand the reader away from their anchor.
  React.useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    // Sections render with id="help-<id>". Accept both the documented external
    // form (`/help#take-off`) and the rail's own `#help-take-off` links.
    const id = raw.startsWith("help-") ? raw : `help-${raw}`;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [sections]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">User guide</h1>
        <p className="mt-1 text-sm text-slate-500">
          How EPC Manager works, from take-off to approved change. Showing the
          features available to your account
          {user ? ` (${ROLE_LABELS[user.role]})` : ""}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <div className="mb-3">
            <GuideSearchBox value={query} onChange={setQuery} className="h-9" />
          </div>
          <nav aria-label="Guide contents" className="print:hidden">
            {contents.map(({ section, depth }) => (
              <a
                key={section.id}
                href={`#help-${section.id}`}
                className={`block truncate rounded px-2 py-1.5 transition-colors hover:bg-slate-100 ${guideContentsRowClass(
                  depth,
                )}`}
              >
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm md:px-8 md:py-6">
          <HelpContent sections={sections} role={role} />
        </article>
      </div>
    </div>
  );
}
