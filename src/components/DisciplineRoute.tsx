import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { CbsOption, FefRow } from "~/lib/types";
import { DisciplinePage } from "~/components/FefTable";
import { disciplines } from "~/config/disciplines";
import { roleDataQueryOptions } from "~/utils/roles";
import { crewMixDataQueryOptions } from "~/utils/crewMixes";
import { useSelectedProject } from "~/lib/selected-project";
import { allowedFefCbsItemIdsQueryOptions } from "~/utils/setup";
import { toCbsOption, makeFefRow } from "~/lib/fef-helpers";

type CbsItem = {
  id: number;
  displayCode: string;
  name: string | null;
  uom: string;
  displayDescription: string | null;
  l1: string;
};

const isMaterialCode = (item: CbsItem) =>
  item.l1.endsWith("01") || item.l1.endsWith("31");
const isSupportLaborCode = (item: CbsItem) =>
  item.l1.endsWith("02") || item.l1.endsWith("32");

function toSupportLaborRow(item: CbsItem): FefRow {
  return makeFefRow({
    id: item.displayCode,
    name: item.name ?? "",
    unit: item.uom,
  });
}

export function DisciplineRoute({
  title,
  disciplineId,
  cbsItems,
}: {
  title: string;
  disciplineId: string;
  cbsItems: CbsItem[];
}) {
  const discipline = disciplines.find((d) => d.label === title);
  const icon = discipline?.icon;
  const { data: roleData } = useQuery(roleDataQueryOptions(disciplineId));
  const roleOptions = roleData?.roleOptions;
  const scheduleOptions = roleData?.scheduleOptions;
  const roleRates = roleData?.roleRates;
  const { data: crewMixOptions } = useQuery(crewMixDataQueryOptions());
  const { projectId } = useSelectedProject();
  const { data: allowedIds } = useQuery({
    ...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
    enabled: projectId !== null,
  });

  const allowedIdSet = React.useMemo(
    () => new Set(allowedIds ?? []),
    [allowedIds],
  );

  const isAllowed = (item: CbsItem) =>
    projectId === null || allowedIdSet.has(item.id);

  const supportLaborInitialRows: FefRow[] = React.useMemo(
    () =>
      cbsItems
        .filter((item) => isSupportLaborCode(item) && isAllowed(item))
        .map(toSupportLaborRow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cbsItems, allowedIdSet, projectId],
  );

  const cbsOptions: CbsOption[] = React.useMemo(
    () =>
      cbsItems
        .filter(
          (item) =>
            !isMaterialCode(item) &&
            !isSupportLaborCode(item) &&
            isAllowed(item),
        )
        .map(toCbsOption),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cbsItems, allowedIdSet, projectId],
  );

  return (
    <DisciplinePage
      title={title}
      disciplineId={disciplineId}
      icon={icon}
      cbsOptions={cbsOptions}
      supportLaborInitialRows={supportLaborInitialRows}
      roleOptions={roleOptions}
      scheduleOptions={scheduleOptions}
      roleRates={roleRates}
      crewMixOptions={crewMixOptions}
    />
  );
}
