import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/electric")({
  component: () => <DisciplinePage title="Electric" />,
});
