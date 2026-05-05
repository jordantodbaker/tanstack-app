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
import { toCbsOption } from "~/lib/fef-helpers";

type CbsItem = {
  id: number;
  displayCode: string;
  name: string | null;
  uom: string;
  displayDescription: string | null;
  l1: string;
};

export function DisciplineRoute({
  title,
  cbsItems,
}: {
  title: string;
  cbsItems: CbsItem[];
}) {
  const discipline = disciplines.find((d) => d.label === title);
  const icon = discipline?.icon;
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
  const isMaterialCode = (item: CbsItem) =>
    item.l1.endsWith("01") || item.l1.endsWith("31");

  const filteredItems = cbsItems.filter(
    (item) =>
      !isMaterialCode(item) &&
      (projectId === null || allowedIdSet.has(item.id)),
  );

  const cbsOptions: CbsOption[] = filteredItems.map(toCbsOption);

  const laborKey = discipline?.l1Codes?.[0]?.[0];

  return (
    <DisciplinePage
      title={title}
      icon={icon}
      cbsOptions={cbsOptions}
      laborKey={laborKey}
      roleOptions={roleOptions}
      scheduleOptions={scheduleOptions}
      roleRates={roleRates}
    />
  );
}
