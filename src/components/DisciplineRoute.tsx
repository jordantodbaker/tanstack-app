import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { CbsOption } from "~/lib/types";
import { DisciplinePage } from "~/components/FefTable";
import { disciplines } from "~/config/disciplines";
import {
  roleOptionsQueryOptions,
  scheduleOptionsQueryOptions,
  roleRatesQueryOptions,
} from "~/utils/roles";
import { useSelectedProject } from "~/lib/selected-project";
import { allowedFefCbsItemIdsQueryOptions } from "~/utils/setup";

type CbsItem = {
  id: number;
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
  const icon = disciplines.find((d) => d.label === title)?.icon;
  const { data: roleOptions } = useQuery(roleOptionsQueryOptions());
  const { data: scheduleOptions } = useQuery(scheduleOptionsQueryOptions());
  const { data: roleRates } = useQuery(roleRatesQueryOptions());
  const { projectId } = useSelectedProject();
  const { data: allowedIds } = useQuery({
    ...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
    enabled: projectId !== null,
  });

  const allowedIdSet = React.useMemo(
    () => new Set(allowedIds ?? []),
    [allowedIds],
  );
  const filteredItems =
    projectId === null
      ? cbsItems
      : cbsItems.filter((item) => allowedIdSet.has(item.id));

  const cbsOptions: CbsOption[] = filteredItems.map((item) => ({
    displayCode: item.displayCode,
    name: item.name ?? "",
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  }));

  return (
    <DisciplinePage
      title={title}
      icon={icon}
      cbsOptions={cbsOptions}
      roleOptions={roleOptions}
      scheduleOptions={scheduleOptions}
      roleRates={roleRates}
    />
  );
}
