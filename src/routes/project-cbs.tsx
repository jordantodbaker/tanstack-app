import { createFileRoute } from "@tanstack/react-router";
import { ProjectCbsView } from "~/components/ProjectCbs/ProjectCbsView";

/**
 * The CBS items available on the selected project: the dictionary rows toggled
 * on the Setup page as an expand/collapse hierarchy whose colouring mirrors the
 * Master CBS Dictionary workbook's colour-by-depth scheme. Project-scoped, so
 * it flows through `ProjectGuard` like the discipline pages (see `__root.tsx`).
 */
export const Route = createFileRoute("/project-cbs")({
  component: ProjectCbsView,
});
