import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage } from "~/components/FefTable";
import { cbsItemsQueryOptions } from "~/utils/cbs";

export const Route = createFileRoute("/piping")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(cbsItemsQueryOptions()),
  component: () => <DisciplinePage title="Piping" />,
});
