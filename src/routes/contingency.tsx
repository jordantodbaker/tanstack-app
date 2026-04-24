import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/contingency")({
  component: () => <DisciplinePage title="Contingency" />,
});
