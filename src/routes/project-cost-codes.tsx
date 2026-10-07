import { createFileRoute } from "@tanstack/react-router";
import { ProjectCostCodeListView } from "~/components/Cbs/ProjectCostCodeListView";

/**
 * The cost codes available on the selected project: the Master CBS rows
 * toggled on the Setup page, as an expand/collapse hierarchy whose colouring
 * mirrors the Master CBS Dictionary workbook. Project-scoped, so it flows
 * through `ProjectGuard` like the discipline pages (see `__root.tsx`).
 */
export const Route = createFileRoute("/project-cost-codes")({
  component: ProjectCostCodeListView,
});
