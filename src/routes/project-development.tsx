import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/project-development")({
  component: () => <DisciplinePage title="Project Development" />,
});
