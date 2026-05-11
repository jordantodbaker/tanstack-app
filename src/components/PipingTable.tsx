import React from "react";
import { type VisibilityState } from "@tanstack/react-table";
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
} from "~/components/Piping/columns";

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
  taskCodeOptions?: { code: string; taskDefinition: string }[];
  pipingFactors?: {
    code: string;
    unit: string;
    values: { size: number; value: number | null }[];
  }[];
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

  const pipingFactorLookup = React.useMemo(() => {
    const m = new Map<string, { unit: string; values: Map<number, number> }>();
    for (const factor of pipingFactors ?? []) {
      let entry = m.get(factor.code);
      if (!entry) {
        entry = { unit: factor.unit, values: new Map<number, number>() };
        m.set(factor.code, entry);
      }
      for (const v of factor.values) {
        if (v.value !== null && !entry.values.has(v.size)) {
          entry.values.set(v.size, v.value);
        }
      }
    }
    return m;
  }, [pipingFactors]);

  const LABOR_DETAIL_COLS = [
    "unit",
    "laborFactor",
    "laborHours",
    "laborRate",
  ] as const;
  const [laborDetailsVisible, setLaborDetailsVisible] = React.useState(true);
  const [takeOffColumnVisibility, setTakeOffColumnVisibility] =
    React.useState<VisibilityState>(() =>
      Object.fromEntries(LABOR_DETAIL_COLS.map((c) => [c, true])),
    );

  const toggleLaborDetails = () => {
    const next = !laborDetailsVisible;
    setLaborDetailsVisible(next);
    setTakeOffColumnVisibility(
      Object.fromEntries(LABOR_DETAIL_COLS.map((c) => [c, next])),
    );
  };

  const takeOffMeta: FefTableMeta = {
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
    roleOptions,
    scheduleOptions,
    roleRates,
    taskCodeOptions,
    pipingFactorLookup,
  };
  const craftMeta: FefTableMeta = {
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
  };
  const supportMeta: FefTableMeta = {
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
    roleOptions,
    scheduleOptions,
    roleRates,
  };

  return (
    <DisciplineTabs
      title={title}
      icon={icon}
      discipline="piping"
      takeOffColumns={takeOffColumns}
      craftColumns={fieldEstimateColumns}
      supportLaborColumns={supportLaborColumns}
      takeOffMeta={takeOffMeta}
      craftMeta={craftMeta}
      supportLaborMeta={supportMeta}
      supportLaborInitialRows={supportLaborInitialRows}
      takeOffColumnVisibility={takeOffColumnVisibility}
      onTakeOffColumnVisibilityChange={setTakeOffColumnVisibility}
      serverPagination={serverPagination}
      takeOffExtraControls={
        <button
          onClick={toggleLaborDetails}
          className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
        >
          {laborDetailsVisible ? "Hide Labor Details" : "Show Labor Details"}
        </button>
      }
    />
  );
}
