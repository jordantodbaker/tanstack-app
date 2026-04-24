import { createFileRoute } from "@tanstack/react-router";
import { FefTable } from "~/components/FefTable";

export const Route = createFileRoute("/fef")({
  component: () => <FefTable title="Field Estimate Form" />,
});
