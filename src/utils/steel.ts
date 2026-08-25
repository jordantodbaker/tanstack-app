import { queryOptions } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

/**
 * Steel take-off (SLTO) reference data — one entry per steel member, carrying
 * the weight / factor / man-hour figures used to calculate structural-steel
 * take-off rates. The steel analogue of `pipingFactorData`; consumed by the
 * Structural Steel take-off sheet to look a member up by its designation.
 */
export type SteelMemberOption = {
  member: string;
  steelType: string;
  lbPerLf: number | null;
  factor: number | null;
  lbPerLfFactored: number | null;
  tonsPerUnit: number | null;
  kgPerM: number | null;
  mhPerUnit: number | null;
  hours: number | null;
  sfPerLf: number | null;
  qtoUom: string;
  uom: string;
  notes: string;
};

const STEEL_MEMBER_SELECT = {
  member: true,
  steelType: true,
  lbPerLf: true,
  factor: true,
  lbPerLfFactored: true,
  tonsPerUnit: true,
  kgPerM: true,
  mhPerUnit: true,
  hours: true,
  sfPerLf: true,
  qtoUom: true,
  uom: true,
  notes: true,
} as const;

export const fetchSteelMembers = createServerFn({ method: "GET" }).handler(
  (): Promise<SteelMemberOption[]> =>
    prisma.steelMember.findMany({
      select: STEEL_MEMBER_SELECT,
      orderBy: { member: "asc" },
    }),
);

export const steelMembersQueryOptions = () =>
  queryOptions({
    queryKey: qk.steelMembers(),
    queryFn: () => fetchSteelMembers(),
    // Reference data — never changes during a session (re-seeded offline).
    staleTime: Infinity,
  });
