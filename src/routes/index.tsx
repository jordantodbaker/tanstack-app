import { createFileRoute } from "@tanstack/react-router";
import { useServerFn, createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";
import "../index.css";
import { useState, useEffect } from "react";
import {
  createColumn,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import React from "react";
import { Button } from "../components/ui/button";
import { AddChangeItemDialog } from "../components/Changelog/AddChangeItemDialog";
import { getColumns } from "~/components/Changelog/ChangelogTable";
import { ChangeLog, StatusLookup } from "../lib/types";

interface PageLoadData {
  changeLogs: ChangeLog[];
  statusLookup: StatusLookup[];
}

export const Route = createFileRoute("/")({
  component: Home,
  loader: () => {
    return getChangelogs();
  },
});

async function toFreshRequest(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return request;

  const body = await request.arrayBuffer();
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });
}

const getChangelogs = createServerFn({ method: "GET" }).handler(async () => {
  return {
    changeLogs: await prisma.changeLog.findMany({ include: { status: true } }),
    statusLookup: await prisma.statusLookup.findMany(),
  };
});

const updateChangelogs = createServerFn({ method: "POST" })
  .inputValidator((data: ChangelogForm[]) => data)
  .handler(async (data) => {
    const logs: ChangelogForm[] = data.data;
    return await Promise.all(
      logs.map((log) => {
        if (log.isDirty) {
          return prisma.changeLog.update({
            where: { id: log.id },
            data: {
              projectId: log.projectId,
              cvrId: log.cvrId,
              description: log.description,
              statusId: +log.statusId,
              updatedAt: new Date(),
            },
          });
        }
      }),
    );
  });

const addChangelog = createServerFn({ method: "POST" })
  .inputValidator((data: Omit<ChangeLog, "id">) => data)
  .handler(async (data) => {
    const log: Omit<ChangeLog, "id"> = data.data;
    const result = await prisma.changeLog.create({
      data: {
        projectId: log.projectId,
        cvrId: log.cvrId,
        description: log.description,
        statusId: +log.statusId,
        updatedAt: new Date(),
      },
    });
    console.log("THE RESULT IS: ", result);
    return result;
  });

const deleteChangelog = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async (data) => {
    const result = await prisma.changeLog.delete({
      where: { id: data.data.id },
    });
    return result;
  });

function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

type ChangelogForm = ChangeLog & { isDirty: boolean };

function Home() {
  const rerender = React.useReducer(() => ({}), {})[1];

  const pageData: PageLoadData = Route.useLoaderData();

  const logForms = pageData.changeLogs.map((log: ChangeLog): ChangelogForm => {
    return { ...log, isDirty: false };
  });
  const [data, _setData] = React.useState(() => [...logForms]);
  const [newLog, setNewLog] = React.useState([]);
  const [columnFilters, setColumnFilters] = React.useState<
    { id: string; value: unknown }[]
  >([]);

  const updateData = useServerFn(updateChangelogs);
  const addLog = useServerFn(addChangelog);
  const deleteLog = useServerFn(deleteChangelog);

  const table = useReactTable({
    data,
    columns: getColumns(pageData.statusLookup, (id) =>
      deleteLog({ data: { id } }),
    ),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: { columnFilters },
    filterFns: {
      fuzzy: () => {
        return true;
      },
    },
    meta: {
      updateData: (
        rowIndex: number,
        columnId: string,
        value: string | unknown,
      ) => {
        _setData((old) =>
          old.map((row, index) => {
            if (index === rowIndex) {
              return {
                ...old[rowIndex],
                [columnId]: value,
                isDirty: true,
              };
            }
            return row;
          }),
        );
      },
      deleteLog: (rowIndex: number) => {
        const newLogs = data.map((log) => {
          if (data[rowIndex].id !== log.id) {
            return log;
          }
        });
        const filteredArray = newLogs.filter(isNotUndefined);

        _setData(filteredArray);
      },
      addLog: (log: ChangeLog) => {
        const newLogs = data;
        newLogs.push({ ...log, isDirty: false });
        _setData([...newLogs]);
      },
      statusLookup: pageData.statusLookup,
    },
  });

  return (
    <main>
      <div className="flex justify-center flex-col p-4">
        <div>
          <div className="mb-4">
            <AddChangeItemDialog
              statusLookup={pageData.statusLookup}
              onAddLog={async (log: { data: Omit<ChangeLog, "id"> }) => {
                const newLog = await addLog(log);
                await table.options.meta?.addLog!(newLog);
              }}
            />
          </div>
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.id === "statusId" && (
                        <div >
                          <select className="w-full"
                            onChange={(e) =>
                              header.column.setFilterValue(
                                e.target.value ? +e.target.value : undefined,
                              )
                            }
                          >
                            <option value="">All</option>
                            {pageData.statusLookup.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.status}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Button
            className="mt-4"
            onClick={async () => await updateData({ data: data })}
          >
            Save Changes{" "}
          </Button>
        </div>
      </div>
    </main>
  );
}
