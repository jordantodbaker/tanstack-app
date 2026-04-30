import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";

export const Route = createFileRoute("/summary")({
  component: SummaryPage,
});

type SummaryRow = {
  description: string;
  qty: string;
  uom: string;
  unitRate: string;
  hrs: string;
  rate: string;
  totalLabor: string;
  material: string;
  sub: string;
  equip: string;
  other: string;
};

const DISCIPLINES = [
  "Project Development",
  "Administration & Home Office",
  "Engineering",
  "Procurement",
  "Indirects",
  "Demolition",
  "Civil",
  "Concrete",
  "Structural Steel",
  "Buildings",
  "Equipment",
  "Piping",
  "Electric",
  "Instruments & Controls",
  "Coatings",
  "Commissioning",
  "Operations",
  "Contingency",
  "Materials",
  "Subcontracts",
];

const INDIRECTS = [
  "Haskell Field Staff",
  "Supervision",
  "Office Staff",
  "Craft Support Labor",
  "Construction Equipment",
  "Haskell Owned",
  "3rd Party",
  "Facilities",
  "Heavy Haul / Crane",
  "Survey & NDE Services",
  "Training & Testing",
  "Mobilize / Demobilize",
  "Other Services",
];

const emptyRow = (): Omit<SummaryRow, "description"> => ({
  qty: "",
  uom: "",
  unitRate: "",
  hrs: "",
  rate: "",
  totalLabor: "",
  material: "",
  sub: "",
  equip: "",
  other: "",
});

function makeRows(descriptions: string[]): SummaryRow[] {
  return descriptions.map((d) => ({ description: d, ...emptyRow() }));
}

function totalCost(row: SummaryRow): string {
  const labor = parseFloat(row.totalLabor);
  const material = parseFloat(row.material);
  const sub = parseFloat(row.sub);
  const equip = parseFloat(row.equip);
  const other = parseFloat(row.other);

  const values = [labor, material, sub, equip, other];
  if (values.every(isNaN)) return "";
  const sum = values.reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0);
  return sum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const columns: {
  key: keyof SummaryRow | "totalCost";
  header: string;
  width?: string;
}[] = [
  { key: "description", header: "Description", width: "w-48" },
  { key: "qty", header: "QTY", width: "w-20" },
  { key: "uom", header: "UOM", width: "w-20" },
  { key: "unitRate", header: "Unit Rate", width: "w-24" },
  { key: "hrs", header: "HRS", width: "w-20" },
  { key: "rate", header: "Rate", width: "w-20" },
  { key: "totalLabor", header: "Total Labor $", width: "w-28" },
  { key: "material", header: "Material $", width: "w-24" },
  { key: "sub", header: "Sub $", width: "w-20" },
  { key: "equip", header: "Equip $", width: "w-20" },
  { key: "other", header: "Other $", width: "w-20" },
  { key: "totalCost", header: "Total Cost $", width: "w-28" },
];

function SummaryTable({
  rows,
  onUpdate,
}: {
  rows: SummaryRow[];
  onUpdate: (
    rowIndex: number,
    field: keyof Omit<SummaryRow, "description">,
    value: string,
  ) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.width} px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 whitespace-nowrap`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.description}
              className="border-b border-gray-200 hover:bg-gray-50"
            >
              {columns.map((col) => {
                if (col.key === "description") {
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-1.5 border border-gray-200 font-medium text-gray-800 whitespace-nowrap"
                    >
                      {row.description}
                    </td>
                  );
                }
                if (col.key === "totalCost") {
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-1.5 border border-gray-200 text-right font-medium text-gray-800 bg-gray-50"
                    >
                      {totalCost(row)}
                    </td>
                  );
                }
                const field = col.key as keyof Omit<SummaryRow, "description">;
                return (
                  <td key={col.key} className="p-0 border border-gray-200">
                    <input
                      type="text"
                      value={row[field]}
                      onChange={(e) => onUpdate(rowIndex, field, e.target.value)}
                      className="w-full px-3 py-1.5 bg-transparent text-right focus:outline-none focus:bg-blue-50"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryPage() {
  const [disciplineRows, setDisciplineRows] = React.useState<SummaryRow[]>(
    () => makeRows(DISCIPLINES),
  );
  const [indirectRows, setIndirectRows] = React.useState<SummaryRow[]>(
    () => makeRows(INDIRECTS),
  );

  const updateDiscipline = (
    rowIndex: number,
    field: keyof Omit<SummaryRow, "description">,
    value: string,
  ) => {
    setDisciplineRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [field]: value } : row)),
    );
  };

  const updateIndirect = (
    rowIndex: number,
    field: keyof Omit<SummaryRow, "description">,
    value: string,
  ) => {
    setIndirectRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [field]: value } : row)),
    );
  };

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Summary</h1>
      <Accordion type="multiple" defaultValue={["disciplines", "indirects"]}>
        <AccordionItem value="disciplines">
          <AccordionTrigger>Disciplines</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={disciplineRows} onUpdate={updateDiscipline} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="indirects">
          <AccordionTrigger>Indirects</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={indirectRows} onUpdate={updateIndirect} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
