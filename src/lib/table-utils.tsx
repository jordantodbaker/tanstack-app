import React from "react";
import { useReactTable } from "@tanstack/react-table";
import { FefRow } from "~/components/FefTable";
import { computeBoreSize } from "./utils";

export function EditableCell({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const initialValue = getValue() as string;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    table.options.meta?.updateData(row.index, column.id, value);
  };

  return (
    <input
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function SizeCell({
  getValue,
  row,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const initialValue = getValue() as string;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    table.options.meta?.updateRow?.(row.index, {
      size: value,
      boreSize: computeBoreSize(value),
    });
  };

  return (
    <input
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}
