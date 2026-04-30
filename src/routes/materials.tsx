import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/materials")({
  loader: () => fetchCbsItemsByL1EndsWith({ data: "01" }),
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

  const sections = useMemo<MaterialSection[]>(() => {
    const groups = new Map<string, typeof cbsItems>();
    for (const item of cbsItems) {
      const key = item.l1[0];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
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
          laborHours: "",
          laborRate: "",
          materialCost: "",
          equipment: "",
          notes: "",
        })),
      };
    });
  }, [cbsItems]);

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <MaterialsIcon className="size-7" />
        Materials
      </h1>
      <Accordion type="multiple" defaultValue={[]}>
        {sections.map((section) => (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger>{section.title}</AccordionTrigger>
            <AccordionContent>
              <DisciplinePage
                initialRows={section.rows}
                cbsOptions={section.cbsOptions}
                variant="materials"
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </main>
  );
}
