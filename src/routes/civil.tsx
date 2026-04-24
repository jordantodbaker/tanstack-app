import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/civil")({
  component: () => <DisciplinePage title="Civil" />,
});
