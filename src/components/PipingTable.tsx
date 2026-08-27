import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { CbsOption, FefRow } from "~/lib/types";
import {
  type FefTableMeta,
  type ServerPagination,
} from "~/lib/table-utils";
import { DisciplineTabs } from "~/components/DisciplineTabs";
import {
  takeOffColumns,
  fieldEstimateColumns,
  supportLaborColumns,
  pipingTakeOffColumnGroups,
} from "~/components/Piping/columns";
import { useSelectedProject } from "~/lib/selected-project";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { customFieldDefsQueryOptions } from "~/utils/customFields";
import {
  customFieldColumnGroup,
  withCustomFieldColumns,
} from "~/lib/custom-field-columns";
import { EMPTY_ARRAY } from "~/lib/fef-helpers";
import {
  unpackPipingFactors,
  type PackedPipingFactor,
} from "~/lib/piping-factors";

type PipingGroupValue = {
  id: number;
  size: number;
  value: number;
  pipingGroupId: number;
};
type PipingGroup = {
  id: number;
  groupNo: number;
  materialClassification: string;
  installCode: string;
  shopCode: string;
  parentCode: string;
  weightCode: string;
  material: string;
  sched: string;
  percentAdder: number;
  values: PipingGroupValue[];
};

type RoleRate = { roleName: string; schedule: string; rate: number };

export function PipingDisciplinePage({
  title,
  icon,
  cbsOptions,
  pipingGroups,
  serverPagination,
  supportLaborInitialRows,
  roleOptions,
  scheduleOptions,
  roleRates,
  crewMixOptions,
  taskCodeOptions,
  pipingFactors,
}: {
  title: string;
  icon?: React.ElementType;
  cbsOptions: CbsOption[];
  pipingGroups: PipingGroup[];
  serverPagination?: ServerPagination;
  supportLaborInitialRows?: FefRow[];
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: RoleRate[];
  crewMixOptions?: FefTableMeta["crewMixOptions"];
  taskCodeOptions?: { code: string; taskDefinition: string }[];
  pipingFactors?: PackedPipingFactor[];
}) {
  const weldGroupOptions = React.useMemo(
    () =>
      Array.from(
        new Set(pipingGroups.map((g) => g.materialClassification)),
      ).sort(),
    [pipingGroups],
  );

  const weldGroupMaterialMap = React.useMemo(
    () =>
      Object.fromEntries(
        pipingGroups.map((g) => [
          g.materialClassification,
          { shopCode: g.shopCode, installCode: g.installCode },
        ]),
      ),
    [pipingGroups],
  );

  // The server sends one packed entry per code, already deduplicated and
  // null-free, so this only has to unflatten it — the first-wins reduction
  // that used to run here now runs once on the server instead of in every
  // browser. See `~/lib/piping-factors`.
  const pipingFactorLookup = React.useMemo(
    () => unpackPipingFactors(pipingFactors),
    [pipingFactors],
  );

  const { projectId } = useSelectedProject();
  // User-defined take-off columns for piping on this project.
  const { data: customFieldDefs = EMPTY_ARRAY } = useQuery(
    customFieldDefsQueryOptions(projectId, "piping"),
  );
  const takeOffColsWithCustom = React.useMemo(
    () => withCustomFieldColumns(takeOffColumns, customFieldDefs),
    [customFieldDefs],
  );
  const takeOffGroupsWithCustom = React.useMemo(() => {
    const group = customFieldColumnGroup(customFieldDefs);
    return group
      ? [...pipingTakeOffColumnGroups, group]
      : pipingTakeOffColumnGroups;
  }, [customFieldDefs]);
  const { data: areas = EMPTY_ARRAY } = useQuery(
    areasByProjectQueryOptions(projectId),
  );
  const areaOptions = React.useMemo(
    () =>
      areas.map((a) => ({
        value: String(a.id),
        label: a.displayId ? `${a.displayId} — ${a.name}` : a.name,
      })),
    [areas],
  );

  // Memoize the meta objects: `metaRev` (table-utils) keys off these arrays, so
  // a fresh meta literal each render would re-render every row and rebuild every
  // dropdown's option list. Stable inputs (see piping.tsx EMPTY fallbacks) keep
  // these references steady while queries stream in.
  const takeOffMeta = React.useMemo<FefTableMeta>(
    () => ({
      cbsOptions,
      weldGroupOptions,
      weldGroupMaterialMap,
      roleOptions,
      scheduleOptions,
      roleRates,
      crewMixOptions,
      taskCodeOptions,
      pipingFactorLookup,
      areaOptions,
    }),
    [
      cbsOptions,
      weldGroupOptions,
      weldGroupMaterialMap,
      roleOptions,
      scheduleOptions,
      roleRates,
      crewMixOptions,
      taskCodeOptions,
      pipingFactorLookup,
      areaOptions,
    ],
  );
  const craftMeta = React.useMemo<FefTableMeta>(
    () => ({ cbsOptions, weldGroupOptions, weldGroupMaterialMap }),
    [cbsOptions, weldGroupOptions, weldGroupMaterialMap],
  );
  const supportMeta = React.useMemo<FefTableMeta>(
    () => ({
      cbsOptions,
      weldGroupOptions,
      weldGroupMaterialMap,
      roleOptions,
      scheduleOptions,
      roleRates,
    }),
    [
      cbsOptions,
      weldGroupOptions,
      weldGroupMaterialMap,
      roleOptions,
      scheduleOptions,
      roleRates,
    ],
  );

  return (
    <DisciplineTabs
      title={title}
      icon={icon}
      discipline="piping"
      takeOffColumns={takeOffColsWithCustom}
      takeOffColumnGroups={takeOffGroupsWithCustom}
      craftColumns={fieldEstimateColumns}
      supportLaborColumns={supportLaborColumns}
      takeOffMeta={takeOffMeta}
      craftMeta={craftMeta}
      supportLaborMeta={supportMeta}
      supportLaborInitialRows={supportLaborInitialRows}
      serverPagination={serverPagination}
    />
  );
}
