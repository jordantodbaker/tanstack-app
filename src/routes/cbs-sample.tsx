import { createFileRoute } from "@tanstack/react-router";
import { CbsSampleView } from "~/components/CbsSample/CbsSampleView";

/**
 * A web view of the formatted CBS sample workbook: an expand/collapse hierarchy
 * whose colouring mirrors the workbook's own colour-by-depth scheme. Reference
 * data, not project-scoped — like `/help`, it sits outside `ProjectGuard` (see
 * `__root.tsx`) so it's reachable without a selected project.
 */
export const Route = createFileRoute("/cbs-sample")({
  component: CbsSampleView,
});
