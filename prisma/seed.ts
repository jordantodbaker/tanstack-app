import { prisma } from "../src/server/db";
import { ChangeLog } from "~/lib/types";
import { StatusLookup } from "~/lib/types";
import { Project } from "~/lib/types";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const changeLogItems: Omit<ChangeLog, "id">[] = [
  {
    projectId: 1,
    cvrId: 1,
    description: "Change log description for CVR ID: 1",
    statusId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 1,
    cvrId: 2,
    description: "Reallocated funds for subcontracts",
    statusId: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 1,
    cvrId: 3,
    description: "New steel supports arrived unexepected",
    statusId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 2,
    cvrId: 4,
    description: "Install underground piping in caramel mocha",
    statusId: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 2,
    cvrId: 5,
    description: "Scaffolding for electric crews working in RAMA 2",
    statusId: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 2,
    cvrId: 6,
    description: "New SoV for insulation subcontracts",
    statusId: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 3,
    cvrId: 7,
    description: "Increased budget for site indirects and support roles",
    statusId: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 3,
    cvrId: 8,
    description:
      "Scope increased after re-evaluation and testing for tracing and containment",
    statusId: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    projectId: 3,
    cvrId: 9,
    description: "New CVR to repair front gate after Jorge crashed into it",
    statusId: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const projects: Project[] = [
  {
    id: 1,
    displayId: "1901",
    name: "1901 - FIME Engineering",
    description: "Description for the FIME engineering project",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    displayId: "1902",
    name: "1902 - FIME Mechanical",
    description: "Description for the FIME mechanical project",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    displayId: "1903",
    name: "1903 - FIME Product Handling",
    description: "Description for the FIME product handling project",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const statusLookups: StatusLookup[] = [
  { id: 1, status: "Requested" },
  { id: 2, status: "Pending" },
  { id: 3, status: "Approved" },
  { id: 4, status: "Denied" },
  { id: 5, status: "Executed" },
  { id: 6, status: "Void" },
];

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === "," && !inQuote) {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

function loadPipingGroups() {
  const csvPath = join(__dirname, "data", "piping_groups.csv");
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/);

  const groups = new Map<
    number,
    {
      groupNo: number;
      materialClassification: string;
      installCode: string;
      shopCode: string;
      parentCode: string;
      weightCode: string;
      material: string;
      sched: string;
      percentAdder: number;
      values: { size: number; value: number }[];
    }
  >();

  lines
    .slice(1)
    .filter((line) => line.trim() !== "")
    .forEach((line) => {
      const cols = parseCSVLine(line);
      const groupNo = parseInt(cols[0]?.trim() ?? "0", 10);
      const size = parseFloat(cols[9]?.trim() ?? "0");
      const value = parseFloat(cols[10]?.trim() ?? "0");

      if (!groups.has(groupNo)) {
        groups.set(groupNo, {
          groupNo,
          materialClassification: cols[1]?.trim() ?? "",
          installCode: cols[2]?.trim() ?? "",
          shopCode: cols[3]?.trim() ?? "",
          parentCode: cols[4]?.trim() ?? "",
          weightCode: cols[5]?.trim() ?? "",
          material: cols[6]?.trim() ?? "",
          sched: cols[8]?.trim() ?? "",
          percentAdder: parseFloat(cols[8]?.trim() ?? "0"),
          values: [],
        });
      }

      groups.get(groupNo)!.values.push({ size, value });
    });

  return groups;
}

function loadCompositeRates() {
  const csvPath = join(__dirname, "data", "composite_rates.csv");
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/);

  const roles = new Map<string, { schedule: string; rate: number }[]>();

  lines
    .slice(1)
    .filter((line) => line.trim() !== "")
    .forEach((line) => {
      const cols = parseCSVLine(line);
      const name = cols[0]?.trim() ?? "";
      const schedule = cols[1]?.trim() ?? "";
      const rate = parseFloat(cols[2]?.trim() ?? "0");

      if (!roles.has(name)) roles.set(name, []);
      roles.get(name)!.push({ schedule, rate });
    });

  return roles;
}

function loadCbsItems() {
  const csvPath = join(__dirname, "data", "cbs.csv");
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/);

  // Skip header row and any trailing empty lines
  return lines
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cols = parseCSVLine(line);
      const or = (v: string) => v.trim() || null;
      return {
        l1: cols[0]?.trim() ?? "",
        l2: cols[1]?.trim() ?? "",
        l3: cols[2]?.trim() ?? "",
        l4: cols[3]?.trim() ?? "",
        l5: cols[4]?.trim() ?? "",
        l6: cols[5]?.trim() ?? "",
        name: cols[6]?.trim() ?? "",
        displayCode: cols[7]?.trim() ?? "",
        uom: cols[8]?.trim() ?? "",
        accountDescription: cols[9]?.trim() ?? "",
        l2Description: or(cols[10] ?? ""),
        core: or(cols[11] ?? ""),
        coreExtension: or(cols[12] ?? ""),
        wbs: or(cols[13] ?? ""),
        p6CostAccount: or(cols[14] ?? ""),
        gl: or(cols[15] ?? ""),
        costTypePC: or(cols[16] ?? ""),
        costTypeSpectrum: or(cols[17] ?? ""),
        costCategory: or(cols[18] ?? ""),
        discipline: or(cols[19] ?? ""),
        subReporting: or(cols[20] ?? ""),
        costCode: or(cols[21] ?? ""),
        description: or(cols[22] ?? ""),
        displayDescription: `${or(cols[7] ?? "")}:  ${or(cols[6] ?? "")}`,
      };
    });
}

async function main() {
  await prisma.changeLog.deleteMany();
  await prisma.statusLookup.deleteMany();
  await prisma.project.deleteMany();
  await prisma.cbsItem.deleteMany();
  await prisma.pipingGroupValue.deleteMany();
  await prisma.pipingGroup.deleteMany();
  await prisma.roleRate.deleteMany();
  await prisma.role.deleteMany();

  await prisma.project.createMany({ data: projects });
  await prisma.statusLookup.createMany({ data: statusLookups });
  await prisma.changeLog.createMany({ data: changeLogItems });

  const cbsItems = loadCbsItems();
  const batchSize = 500;
  for (let i = 0; i < cbsItems.length; i += batchSize) {
    await prisma.cbsItem.createMany({ data: cbsItems.slice(i, i + batchSize) });
    console.log(
      `Inserted CBS items ${i + 1}–${Math.min(i + batchSize, cbsItems.length)} of ${cbsItems.length}`,
    );
  }

  const pipingGroupsMap = loadPipingGroups();
  for (const [, groupData] of pipingGroupsMap) {
    const { values, ...groupFields } = groupData;
    await prisma.pipingGroup.create({
      data: {
        ...groupFields,
        values: { createMany: { data: values } },
      },
    });
  }
  console.log(`Inserted ${pipingGroupsMap.size} piping groups`);

  const compositeRates = loadCompositeRates();
  for (const [name, rates] of compositeRates) {
    await prisma.role.create({
      data: {
        name,
        rates: { createMany: { data: rates } },
      },
    });
  }
  console.log(`Inserted ${compositeRates.size} roles`);
}

main().then(async () => {
  await prisma.$disconnect();
});
