import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";

export const Route = createFileRoute("/indirects")({
  component: () => <DisciplinePage title="Indirects" />,
});
