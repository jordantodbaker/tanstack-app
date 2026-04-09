import { prisma } from "../src/server/db";
import { ChangeLog } from "~/lib/types";
import { StatusLookup } from "~/lib/types";

const changeLogItems: Omit<ChangeLog, 'id'>[] = [
    {projectId: 1, cvrId: 1, description: "Change log description for CVR ID: 1", statusId: 1, createdAt: new Date, updatedAt: new Date },
    {projectId: 1, cvrId: 2, description: "Reallocated funds for subcontracts", statusId: 2, createdAt: new Date, updatedAt: new Date },
    {projectId: 1, cvrId: 3, description: "New steel supports arrived unexepected", statusId: 1, createdAt: new Date, updatedAt: new Date },
    {projectId: 2, cvrId: 4, description: "Install underground piping in caramel mocha", statusId: 3, createdAt: new Date, updatedAt: new Date },
    {projectId: 2, cvrId: 5, description: "Scaffolding for electric crews working in RAMA 2", statusId: 5, createdAt: new Date, updatedAt: new Date },
    {projectId: 2, cvrId: 6, description: "New SoV for insulation subcontracts", statusId: 4, createdAt: new Date, updatedAt: new Date },
    {projectId: 3, cvrId: 7, description: "Increased budget for site indirects and support roles", statusId: 4, createdAt: new Date, updatedAt: new Date },
    {projectId: 3, cvrId: 8, description: "Scope increased after re-evaluation and testing for tracing and containment", statusId: 6, createdAt: new Date, updatedAt: new Date },
    {projectId: 3, cvrId: 9, description: "New CVR to repair front gate after Jorge crashed into it", statusId: 2, createdAt: new Date, updatedAt: new Date },
]

const statusLookups: StatusLookup[] = [
    {id: 1, status: "Requested"},
    {id: 2, status: "Pending"},
    {id: 3, status: "Approved"},
    {id: 4, status: "Denied"},
    {id: 5, status: "Executed"},
    {id: 6, status: "Void"},
]

async function main() {
    await prisma.statusLookup.deleteMany();
    await prisma.changeLog.deleteMany();

    const status = await prisma.statusLookup.createMany({data: statusLookups})
    const logs = await prisma.changeLog.createMany({data: changeLogItems})
}

main().then(async () => {
    await prisma.$disconnect()
})