import type { CbsOption } from "~/lib/types";
import { DisciplinePage } from "~/components/FefTable";
import { disciplines } from "~/config/disciplines";

type CbsItem = {
  displayCode: string;
  name: string | null;
  uom: string;
  displayDescription: string | null;
};

export function DisciplineRoute({
  title,
  cbsItems,
}: {
  title: string;
  cbsItems: CbsItem[];
}) {
  const cbsOptions: CbsOption[] = cbsItems.map((item) => ({
    displayCode: item.displayCode,
    name: item.name ?? "",
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  }));
  const icon = disciplines.find((d) => d.label === title)?.icon;

  return <DisciplinePage title={title} icon={icon} cbsOptions={cbsOptions} />;
}
