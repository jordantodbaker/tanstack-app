import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/administration")({
  component: () => <DisciplinePage title="Administration & Home Office" />,
});
