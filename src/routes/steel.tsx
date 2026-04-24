import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/steel")({
  component: () => <DisciplinePage title="Structural Steel" />,
});
