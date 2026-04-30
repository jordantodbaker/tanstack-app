import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type CbsOption, type FefRow } from "~/components/FefTable";
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

function MaterialsPage() {
  const cbsItems = Route.useLoaderData();

  const groups = new Map<string, typeof cbsItems>();
  for (const item of cbsItems) {
    const key = item.l1[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const sortedKeys = [...groups.keys()].sort();

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Materials</h1>
      <Accordion type="multiple" defaultValue={[]}>
        {sortedKeys.map((key) => {
          const items = groups.get(key)!;
          const sectionTitle = items[0].accountDescription ?? key;

          const cbsOptions: CbsOption[] = items.map((item) => ({
            displayCode: item.displayCode,
            name: item.name,
            uom: item.uom,
            displayDescription: item.displayDescription ?? null,
          }));

          const rows: FefRow[] = items.map((item) => ({
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
          }));

          return (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>{sectionTitle}</AccordionTrigger>
              <AccordionContent>
                <DisciplinePage initialRows={rows} cbsOptions={cbsOptions} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </main>
  );
}
