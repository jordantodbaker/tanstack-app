import { useState, useEffect } from "react";
import {
  CellContext,
  createColumn,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";

import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

import { Button } from "../ui/button";

import { ChangeLog, StatusLookup } from "../../lib/types";

const TableCell = ({
  getValue,
  row,
  column,
  table,
}: {
  getValue: any;
  row: Row<ChangeLog>;
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
  row: Row<ChangeLog>;
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
      {table.options.meta.statusLookup.map((item: StatusLookup) => (
        <option
          key={item.id}
          value={item.id}
          selected={initialValue === item.id}
        >
          {item.status}
        </option>
      ))}
    </select>
  );
};

const columnHelper = createColumnHelper<ChangeLog>();

export const getColumns = (statusLookup: StatusLookup[]) => [
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
  columnHelper.accessor("statusId", {
    header: "Status",
    footer: (info) => info.column.id,
    cell: TableDropdown,
    meta: { statusLookup: statusLookup },
  }),
  {
    id: "delete",
    header: "Delete",
    cell: (info: CellContext<ChangeLog, string>) => (
      <div className="flex justify-center">
        <Dialog>
          <DialogTrigger>
            <Button>Delete</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Are you absolutely sure you want to delete this?
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete this
                log record.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose>
                <Button
                  onClick={() => {
                    info.table.options.meta?.deleteLog?.(info.row.index);
                  }}
                >
                  Delete
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    ),
  },
];
