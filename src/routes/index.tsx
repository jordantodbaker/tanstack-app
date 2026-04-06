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
import { AddChangeItemDialog } from "../components/AddChangeItemDialog";

type Changelog = {
  id: number;
  projectId: number;
  cvrId: number;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

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

const TableCell = ({
  getValue,
  row,
  column,
  table,
}: {
  getValue: any;
  row: Row<Changelog>;
  column: any;
  table: any;
}) => {
  const initialValue = getValue();
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);
  const onBlur = () => {
    table.options.meta?.updateData(row.index, column.id, value);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
      className="w-full"
    />
  );
};

const TableDropdown = ({
  getValue,
  row,
  column,
  table,
}: {
  getValue: any;
  row: Row<Changelog>;
  column: any;
  table: any;
}) => {
  const initialValue = getValue();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    table.options.meta?.updateData(row.index, column.id, value);
  };

  return (
    <select
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
      className="w-full"
    >
      <option value="requested" selected={initialValue === "Requested"}>
        Requested
      </option>
      <option value="pending" selected={initialValue === "Pending"}>
        Pending
      </option>
      <option value="approved" selected={initialValue === "Approved"}>
        Approved
      </option>
      <option value="denied" selected={initialValue === "Denied"}>
        Denied
      </option>
      <option value="executed" selected={initialValue === "Executed"}>
        Executed
      </option>
    </select>
  );
};

const getChangelogs = createServerFn({ method: "GET" }).handler(async () => {
  return prisma.changelog.findMany();
});

const updateChangelogs = createServerFn({ method: "POST" })
  .inputValidator((data: Changelog[]) => data)
  .handler(async (data) => {
    const logs: Changelog[] = data.data;
    console.log("THE DATA: ", logs);
    return Promise.all(
      logs.map((log) =>
        prisma.changelog.update({
          where: { id: log.id },
          data: { ...log, updatedAt: new Date() },
        }),
      ),
    );
    //return prisma.changelog.updateMany<ChangelogUpdate>({ data: log });
  });

// const updateChangelogs = () => {
//   console.log("DIRKA");
// };

const columnHelper = createColumnHelper<Changelog>();

const columns = [
  columnHelper.accessor("id", {
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelper.accessor((row) => row.projectId, {
    id: "projectId",
    cell: (info) => <i>{info.getValue()}</i>,
    header: () => <span>Project Id</span>,
    footer: (info) => info.column.id,
  }),
  columnHelper.accessor("cvrId", {
    header: () => "CVR ID",
    cell: (info) => info.renderValue(),
    footer: (info) => info.column.id,
  }),
  columnHelper.accessor("description", {
    header: () => <span>Description</span>,
    footer: (info) => info.column.id,
    cell: TableCell,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    footer: (info) => info.column.id,
    cell: TableDropdown,
  }),
];

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

function Home() {
  const rerender = React.useReducer(() => ({}), {})[1];

  const logs: Changelog[] = Route.useLoaderData();
  const [data, _setData] = React.useState(() => [...logs]);

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
              };
            }
            return row;
          }),
        );
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
            {/* <tfoot>
              {table.getFooterGroups().map((footerGroup) => (
                <tr key={footerGroup.id}>
                  {footerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.footer,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </tfoot> */}
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
