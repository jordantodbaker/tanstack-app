import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DisciplinePage } from "~/components/FefTable";
import type { CbsOption, FefRow } from "~/lib/types";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1EndsWith } from "~/utils/cbs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import { useSelectedProject } from "~/lib/selected-project";
import { allowedFefCbsItemIdsQueryOptions } from "~/utils/setup";

export const Route = createFileRoute("/materials")({
  loader: () => fetchCbsItemsByL1EndsWith({ data: ["01", "31"] }),
  component: MaterialsPage,
});

const MaterialsIcon = disciplineById.materials.icon;

type MaterialSection = {
  key: string;
  title: string;
  cbsOptions: CbsOption[];
  rows: FefRow[];
};

function MaterialsPage() {
  const cbsItems = Route.useLoaderData();
  const { projectId } = useSelectedProject();
  const { data: allowedIds } = useQuery({
    ...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
    enabled: projectId !== null,
  });

  const allowedIdSet = useMemo(() => new Set(allowedIds ?? []), [allowedIds]);

  const sections = useMemo<MaterialSection[]>(() => {
    const visibleItems =
      projectId === null
        ? cbsItems
        : cbsItems.filter((item) => allowedIdSet.has(item.id));

    const groups = new Map<string, typeof visibleItems>();
    for (const item of visibleItems) {
      if (!groups.has(item.l1)) groups.set(item.l1, []);
      groups.get(item.l1)!.push(item);
    }
    return [...groups.keys()].sort().map((key) => {
      const items = groups.get(key)!;
      return {
        key,
        title: items[0].accountDescription ?? key,
        cbsOptions: items.map((item) => ({
          displayCode: item.displayCode,
          name: item.name,
          uom: item.uom,
          displayDescription: item.displayDescription ?? null,
        })),
        rows: items.map((item) => ({
          id: item.displayCode,
          description: item.name ?? "",
          shopField: "",
          weldGroupDescription: "",
          quantity: "",
          size: "",
          unit: item.uom,
          metallurgyCode: "",
          boreSize: "",
          role: "",
          schedule: "",
          taskCode: "",
          laborHours: "",
          laborRate: "",
          materialCost: "",
          equipment: "",
          notes: "",
        })),
      };
    });
  }, [cbsItems, projectId, allowedIdSet]);

  return (
    <main className="p-3 md:p-4">
      <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
        <MaterialsIcon className="size-6 md:size-7" />
        Materials
      </h1>
      {sections.length === 0 ? (
        <p className="text-sm text-slate-500">
          No materials are enabled for the selected project. Enable material CBS
          items on the Setup page.
        </p>
      ) : (
        <Accordion type="multiple" defaultValue={[]}>
          {sections.map((section) => (
            <AccordionItem key={section.key} value={section.key}>
              <AccordionTrigger>{section.title}</AccordionTrigger>
              <AccordionContent>
                <DisciplinePage
                  initialRows={section.rows}
                  cbsOptions={section.cbsOptions}
                  variant="materials"
                  sectionKey={section.key}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </main>
  );
}
