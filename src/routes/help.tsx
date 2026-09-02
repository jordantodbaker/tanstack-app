import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { HELP_SECTIONS } from "~/config/help-guide";
import {
  flattenSections,
  searchSections,
  visibleSections,
} from "~/lib/help-visibility";
import { HelpContent } from "~/components/Help/HelpContent";
import { useCurrentUser } from "~/lib/use-current-user";
import { ROLE_LABELS, type UserRole } from "~/utils/users";

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
  // Least privilege until the user resolves — never flash gated content.
  const role: UserRole = user?.role ?? "USER";

  const [query, setQuery] = React.useState("");

  const sections = React.useMemo(
    () => searchSections(visibleSections(HELP_SECTIONS, role), query),
    [role, query],
  );
  const contents = React.useMemo(() => flattenSections(sections), [sections]);

  // Honour the `#section` in the URL once the (role-filtered) content is on
  // the page. Runs on every section change so a search that re-renders the
  // body doesn't strand the reader away from their anchor.
  React.useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) return;
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
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute top-1/2 left-2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the guide…"
              aria-label="Search the guide"
              className="h-9 w-full rounded-md border border-slate-200 bg-white pr-2 pl-7 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus-visible:border-slate-400"
            />
          </div>
          <nav aria-label="Guide contents" className="print:hidden">
            {contents.map(({ section, depth }) => (
              <a
                key={section.id}
                href={`#help-${section.id}`}
                className={`block truncate rounded px-2 py-1.5 transition-colors hover:bg-slate-100 ${
                  depth === 0
                    ? "text-sm font-medium text-slate-700"
                    : "pl-5 text-xs text-slate-500"
                }`}
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
