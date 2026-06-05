import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, CornerDownLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useSelectedProject } from "~/lib/selected-project";
import {
  searchQueryOptions,
  type SearchResult,
  type SearchResultEntity,
} from "~/utils/search";
import { StatusBadge } from "~/components/Changelog/StatusBadge";
import { FcoStatusBadge } from "~/components/FCOLog/FcoBadges";
import { RfiStatusBadge } from "~/components/Rfi/RfiBadges";
import { PcoStatusBadge } from "~/components/Pco/PcoBadges";
import { TrendStatusBadge } from "~/components/Trend/TrendBadges";
import type { ChangeStatus } from "~/utils/changelog";
import type { FcoStatus } from "~/utils/fcoLog";
import type { RfiStatus } from "~/utils/rfis";
import type { PcoStatus } from "~/utils/pco";
import type { TrendStatus } from "~/utils/trends";

/** Render order of the entity groups in the results list. */
const GROUP_ORDER: SearchResultEntity[] = [
  "cvr",
  "fco",
  "rfi",
  "pco",
  "trend",
];

const GROUP_LABELS: Record<SearchResultEntity, string> = {
  cvr: "Change Orders (CVR)",
  fco: "Field Change Orders (FCO)",
  rfi: "RFIs",
  pco: "Prime Change Orders (PCO)",
  trend: "Trends",
};

/** Status enum strings are carried as plain strings on `SearchResult`; cast at
 *  the badge boundary per entity (each badge component is typed to its enum). */
function ResultStatusBadge({ result }: { result: SearchResult }) {
  switch (result.entity) {
    case "cvr":
      return <StatusBadge status={result.status as ChangeStatus} />;
    case "fco":
      return <FcoStatusBadge status={result.status as FcoStatus} />;
    case "rfi":
      return <RfiStatusBadge status={result.status as RfiStatus} />;
    case "pco":
      return <PcoStatusBadge status={result.status as PcoStatus} />;
    case "trend":
      return <TrendStatusBadge status={result.status as TrendStatus} />;
  }
}

/**
 * Global command palette. Searches the change-pipeline entities for the
 * selected project and navigates to the matching list route with the record's
 * number pre-seeded into that page's search box. Owns its own open state, the
 * ⌘K / Ctrl-K (and "/") global shortcut, and renders the header trigger button
 * — so a single `<GlobalSearch />` mount in the header wires up everything.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { projectId } = useSelectedProject();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Debounce the term feeding the query so each keystroke doesn't fire a fetch.
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 200);
    return () => clearTimeout(t);
  }, [input]);

  // Global shortcut: ⌘K / Ctrl-K anywhere, or "/" when not typing in a field.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash =
        e.key === "/" && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey;
      if (cmdK || slash) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: results = [], isFetching } = useQuery(
    searchQueryOptions(projectId, debounced),
  );

  // Flatten in group order so the keyboard cursor index lines up with render
  // order across groups.
  const ordered = React.useMemo(() => {
    const out: SearchResult[] = [];
    for (const entity of GROUP_ORDER) {
      for (const r of results) if (r.entity === entity) out.push(r);
    }
    return out;
  }, [results]);

  // Keep the active cursor in range as results change.
  React.useEffect(() => {
    setActiveIndex((i) => (ordered.length === 0 ? 0 : Math.min(i, ordered.length - 1)));
  }, [ordered.length]);

  const reset = React.useCallback(() => {
    setInput("");
    setDebounced("");
    setActiveIndex(0);
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) reset();
    },
    [reset],
  );

  const select = React.useCallback(
    (result: SearchResult | undefined) => {
      if (!result) return;
      navigate({ to: result.route, search: { q: result.filterQuery } });
      handleOpenChange(false);
    },
    [navigate, handleOpenChange],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(ordered[activeIndex]);
    }
  }

  const termReady = debounced.trim().length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
        aria-label="Search"
      >
        <Search size={15} className="shrink-0" />
        <span>Search…</span>
        <kbd className="ml-2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] translate-y-0 w-[calc(100vw-2rem)] max-w-xl p-0 gap-0 overflow-hidden"
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search change orders, field change orders, RFIs, prime change
            orders, and trends in the selected project.
          </DialogDescription>

          <div className="flex items-center gap-2 border-b border-slate-200 px-3">
            <Search size={16} className="shrink-0 text-slate-400" />
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search CVRs, FCOs, RFIs, PCOs, Trends…"
              className="h-11 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 focus-visible:border-0"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-1">
            {projectId === null ? (
              <EmptyHint>Select a project from the header to search.</EmptyHint>
            ) : !termReady ? (
              <EmptyHint>
                Type at least 2 characters to search this project.
              </EmptyHint>
            ) : isFetching && ordered.length === 0 ? (
              <EmptyHint>Searching…</EmptyHint>
            ) : ordered.length === 0 ? (
              <EmptyHint>No matches for “{debounced.trim()}”.</EmptyHint>
            ) : (
              <Results
                ordered={ordered}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onSelect={select}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Results({
  ordered,
  activeIndex,
  onHover,
  onSelect,
}: {
  ordered: SearchResult[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (result: SearchResult) => void;
}) {
  // Walk the same group order the flat list was built in, tracking the running
  // flat index so highlight/hover map back to the keyboard cursor.
  let flatIndex = -1;
  return (
    <>
      {GROUP_ORDER.map((entity) => {
        const rows = ordered.filter((r) => r.entity === entity);
        if (rows.length === 0) return null;
        return (
          <div key={entity} className="py-1">
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {GROUP_LABELS[entity]}
            </div>
            {rows.map((r) => {
              flatIndex += 1;
              const index = flatIndex;
              const active = index === activeIndex;
              return (
                <button
                  key={`${r.entity}-${r.id}`}
                  type="button"
                  onMouseEnter={() => onHover(index)}
                  onClick={() => onSelect(r)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    active ? "bg-red-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="w-24 shrink-0 truncate font-mono text-xs text-slate-500">
                    {r.number || `#${r.id}`}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-800">
                    {r.title}
                  </span>
                  <ResultStatusBadge result={r} />
                  {active && (
                    <CornerDownLeft
                      size={13}
                      className="shrink-0 text-slate-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-8 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

/** True when the event target is an editable field (so "/" doesn't hijack typing). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
