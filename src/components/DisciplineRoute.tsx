import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { CbsOption, FefRow } from "~/lib/types";
import { DisciplinePage } from "~/components/FefTable";
import { disciplines } from "~/config/disciplines";
import { isMaterialL1, isSupportL1 } from "~/config/disciplines-data";
import { roleDataQueryOptions } from "~/utils/roles";
import { crewMixDataQueryOptions } from "~/utils/crewMixes";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import { steelMembersQueryOptions } from "~/utils/steel";
import { toCbsOption, makeFefRow } from "~/lib/fef-helpers";

type CbsItem = {
  id: number;
  displayCode: string;
  costCode: string;
  name: string | null;
  uom: string;
  l1: string;
  subReporting: boolean | null;
};

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
  const { projectId } = useSelectedProject();
  // Labor rates resolve version → project → global, so the grid has to ask
  // for role data at the scope it is actually pricing.
  const { versionId } = useSelectedVersion();
  const { data: roleData } = useQuery(
    roleDataQueryOptions({ disciplineId, projectId, versionId }),
  );
  const roleOptions = roleData?.roleOptions;
  const scheduleOptions = roleData?.scheduleOptions;
  const roleRates = roleData?.roleRates;
  const { data: crewMixOptions } = useQuery(crewMixDataQueryOptions());

  // Structural Steel only: SLTO members feed the Task Code searchable dropdown.
  const isSteel = disciplineId === "steel";
  const { data: steelMembers } = useQuery({
    ...steelMembersQueryOptions(),
    enabled: isSteel,
  });
  const steelMemberOptions = React.useMemo(
    () =>
      (steelMembers ?? []).map((m) => ({
        value: m.member,
        label: m.member,
        searchText: m.member.toLowerCase(),
      })),
    [steelMembers],
  );
  // member → QTO UoM, used to fill the Unit column on Task Code selection.
  const steelMemberUomLookup = React.useMemo(
    () =>
      Object.fromEntries(
        (steelMembers ?? []).map((m) => [m.member, m.qtoUom]),
      ),
    [steelMembers],
  );
  // member → TNS/Unit, used to compute Total Tons (only members that have one).
  const steelMemberTonsLookup = React.useMemo(
    () =>
      Object.fromEntries(
        (steelMembers ?? [])
          .filter((m) => m.tonsPerUnit != null)
          .map((m) => [m.member, m.tonsPerUnit as number]),
      ),
    [steelMembers],
  );

  // `cbsItems` arrives already narrowed to the project's grants (server-side,
  // see `$discipline.tsx`), so only the sheet split is decided here.
  const supportLaborInitialRows: FefRow[] = React.useMemo(
    () =>
      cbsItems.filter((item) => isSupportL1(item.l1)).map(toSupportLaborRow),
    [cbsItems],
  );

  const cbsOptions: CbsOption[] = React.useMemo(
    () =>
      cbsItems
        .filter((item) => !isMaterialL1(item.l1) && !isSupportL1(item.l1))
        .map(toCbsOption),
    [cbsItems],
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
      steelMemberOptions={steelMemberOptions}
      steelMemberUomLookup={steelMemberUomLookup}
      steelMemberTonsLookup={steelMemberTonsLookup}
    />
  );
}
