import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/instruments")({
  component: () => <DisciplinePage title="Instruments & Controls" />,
});
