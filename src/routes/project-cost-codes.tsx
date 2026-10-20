import { createFileRoute } from "@tanstack/react-router";
import { ProjectCostCodeListView } from "~/components/Cbs/ProjectCostCodeListView";

/**
 * The cost codes available on the selected project: the Master CBS rows
 * toggled on the Setup page, as an expand/collapse hierarchy whose coloring
 * mirrors the Master CBS Dictionary workbook. Project-scoped, so it flows
 * through `ProjectGuard` like the discipline pages (see `__root.tsx`).
 */
/**
 * `?code=` opens the page on one account — the link you paste into an email so
 * the other person lands on the row rather than hunting for it. Parsed
 * leniently: an unknown or malformed code simply shows the page as normal.
 */
export const Route = createFileRoute("/project-cost-codes")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: ProjectCostCodesPage,
});

function ProjectCostCodesPage() {
  const { code } = Route.useSearch();
  return <ProjectCostCodeListView focusCode={code ?? null} />;
}
