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
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import React from "react";
import { Button } from "../components/ui/button";
import { AddChangeItemDialog } from "../components/Changelog/AddChangeItemDialog";
import { columns } from "~/components/Changelog/ChangelogTable";
import { Changelog } from "../lib/types";
import { ChangelogScalarFieldEnum } from "~/generated/prisma/internal/prismaNamespace";

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
  return prisma.changelog.findMany();
});

const updateChangelogs = createServerFn({ method: "POST" })
  .inputValidator((data: ChangelogForm[]) => data)
  .handler(async (data) => {
    const logs: ChangelogForm[] = data.data;
    return await Promise.all(
      logs.map((log) => {
        if (log.isDirty) {
          return prisma.changelog.update({
            where: { id: log.id },
            data: {
              projectId: log.projectId,
              cvrId: log.cvrId,
              description: log.description,
              status: log.status,
              updatedAt: new Date(),
            },
          });
        }
      }),
    );
  });

const defaultData: Changelog[] = [
  {
    id: 0,
    projectId: 0,
    cvrId: 0,
    description: "",
    status: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

type ChangelogForm = Changelog & { isDirty: boolean };

function Home() {
  const rerender = React.useReducer(() => ({}), {})[1];

  const logs: Changelog[] = Route.useLoaderData();
  const logForms = logs.map((log: Changelog): ChangelogForm => {
    return { ...log, isDirty: false };
  });
  const [data, _setData] = React.useState(() => [...logForms]);
  const [newLog, setNewLog] = React.useState([]);

  const updateData = useServerFn(updateChangelogs);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
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

        console.log("The new logs are: ", newLogs);
      },
    },
  });

  return (
    <main>
      <div className="flex justify-center flex-col p-4">
        <div>
          <div className="mb-4">
            <AddChangeItemDialog />
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
            Submit{" "}
          </Button>
        </div>
      </div>
    </main>
  );
}
