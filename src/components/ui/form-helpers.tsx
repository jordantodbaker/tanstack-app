import * as React from "react";
import { Input } from "~/components/ui/input";

export function Labeled({
  label,
  help,
  className = "",
  children,
}: {
  label: string;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </span>
      {children}
      {help && (
        <span className="mt-0.5 block text-xs text-slate-400">{help}</span>
      )}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs/relaxed"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDateInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type InputRest = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange"
>;

/**
 * A date box over an ISO timestamp: shows the local calendar day and hands
 * back midnight-local as ISO, or `null` when cleared. A field that must keep
 * a date decides what a cleared box means at the call site.
 */
export function DateInput({
  value,
  onChange,
  ...rest
}: InputRest & {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  return (
    <Input
      {...rest}
      type="date"
      value={toDateInputValue(value)}
      onChange={(e) => onChange(fromDateInputValue(e.target.value))}
    />
  );
}

/**
 * A number box that always hands back a number: an empty or unparseable
 * entry is 0. `integer` drops any fraction typed, for day counts.
 */
export function NumberInput({
  value,
  onChange,
  integer = false,
  ...rest
}: InputRest & {
  value: number;
  onChange: (n: number) => void;
  integer?: boolean;
}) {
  return (
    <Input
      {...rest}
      type="number"
      value={value}
      onChange={(e) =>
        onChange(
          (integer
            ? parseInt(e.target.value, 10)
            : parseFloat(e.target.value)) || 0,
        )
      }
    />
  );
}
