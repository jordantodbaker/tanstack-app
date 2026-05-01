import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import { DISCIPLINE_LABELS } from "~/config/disciplines";
import { useMaterialsTotalsByFirstDigit } from "~/lib/materialsStore";

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

function parseMoney(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

function totalCost(row: SummaryRow): string {
  const values = [
    parseMoney(row.totalLabor),
    parseMoney(row.material),
    parseMoney(row.sub),
    parseMoney(row.equip),
    parseMoney(row.other),
  ];
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
  currency?: boolean;
}[] = [
  { key: "description", header: "Description", width: "w-48" },
  { key: "qty", header: "QTY", width: "w-20" },
  { key: "uom", header: "UOM", width: "w-20" },
  { key: "unitRate", header: "Unit Rate", width: "w-24", currency: true },
  { key: "hrs", header: "HRS", width: "w-20" },
  { key: "rate", header: "Rate", width: "w-20", currency: true },
  { key: "totalLabor", header: "Total Labor $", width: "w-28", currency: true },
  { key: "material", header: "Material $", width: "w-24", currency: true },
  { key: "sub", header: "Sub $", width: "w-20", currency: true },
  { key: "equip", header: "Equip $", width: "w-20", currency: true },
  { key: "other", header: "Other $", width: "w-20", currency: true },
  { key: "totalCost", header: "Total Cost $", width: "w-28", currency: true },
];

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
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
          {rows.map((row) => (
            <tr key={row.description} className="border-b border-gray-200">
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
                const value =
                  col.key === "totalCost"
                    ? totalCost(row)
                    : row[col.key as keyof Omit<SummaryRow, "description">];
                const display = col.currency && value ? `$${value}` : value;
                return (
                  <td
                    key={col.key}
                    className="px-3 py-1.5 border border-gray-200 text-right text-slate-500 bg-slate-100"
                  >
                    {display}
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

const indirectRows = makeRows(INDIRECTS);

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SummaryPage() {
  const materialsByDigit = useMaterialsTotalsByFirstDigit();

  const disciplineRows: SummaryRow[] = DISCIPLINE_LABELS.map((label, i) => {
    const total = materialsByDigit.get(String(i)) ?? 0;
    return {
      description: label,
      ...emptyRow(),
      material: total > 0 ? formatMoney(total) : "",
    };
  });

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Summary</h1>
      <Accordion type="multiple" defaultValue={["disciplines", "indirects"]}>
        <AccordionItem value="disciplines">
          <AccordionTrigger>Disciplines</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={disciplineRows} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="indirects">
          <AccordionTrigger>Indirects</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={indirectRows} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
