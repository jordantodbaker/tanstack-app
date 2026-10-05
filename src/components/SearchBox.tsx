import { Search } from "lucide-react";
import { cn } from "~/lib/utils";

/**
 * A plain search `<input>` with the app's standard styling and an optional
 * leading magnifier. Shared across features (the Help guide, the CBS Sample
 * tree, …) so the search affordance stays consistent. `showIcon` off drops the
 * icon (and its left padding) for compact placements; `className` carries the
 * per-placement size (e.g. `h-8 w-64`).
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  showIcon = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  showIcon?: boolean;
}) {
  const input = (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        "w-full rounded-md border border-slate-200 bg-white text-sm text-slate-700 outline-none placeholder:text-slate-400 focus-visible:border-slate-400",
        showIcon ? "pr-2 pl-7" : "px-2",
        className,
      )}
    />
  );
  if (!showIcon) return input;
  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute top-1/2 left-2 -translate-y-1/2 text-slate-400"
      />
      {input}
    </div>
  );
}
