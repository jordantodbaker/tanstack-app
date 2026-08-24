import * as React from "react";

const TONE_CLASS = {
  slate: "text-slate-800",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  violet: "text-violet-700",
  red: "text-red-700",
} as const;

export type StatTone = keyof typeof TONE_CLASS;

export function StatCard({
  label,
  value,
  tone = "slate",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  icon?: React.ElementType;
}) {
  const toneClass = TONE_CLASS[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        {/* `leading-tight` keeps wrapped long labels ("Approved unbilled (3)")
            visually compact on 2-col mobile grids where they wrap to 2 lines.
            `text-sm sm:text-xs` raises the on-phone size above the ~14px
            sustained-reading threshold; desktop keeps the denser look. */}
        <p className="text-sm sm:text-xs leading-tight text-slate-500">{label}</p>
        {Icon && <Icon className={`size-4 ${toneClass} opacity-70 shrink-0`} />}
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

export type StatCardSpec = {
  label: string;
  value: string;
  tone?: StatTone;
  icon?: React.ElementType;
};

/**
 * The stat-card strip every list page shows above its table. Each of the five
 * change-pipeline routes had its own `*StatsCards` component: the same grid
 * wrapper, a row of `StatCard`s, and a hand-written props interface threading
 * every number through one field at a time. Taking an array collapses all of
 * that — routes now pass their computed stats straight in.
 *
 * The widest breakpoint follows the card count, which reproduces exactly what
 * the routes rendered before: the five-card pages (CVR / RFI / PCO) went wide
 * at `lg`, the six-card pages (FCO / Trend) at `xl`. Other counts fall back to
 * the `sm` three-column layout rather than inventing a breakpoint.
 */
const WIDE_GRID_CLASS: Record<number, string> = {
  5: "lg:grid-cols-5",
  6: "xl:grid-cols-6",
};

export function StatCardRow({ cards }: { cards: StatCardSpec[] }) {
  const wide = WIDE_GRID_CLASS[cards.length] ?? "";
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${wide} gap-3`}>
      {cards.map((c) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          tone={c.tone}
          icon={c.icon}
        />
      ))}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm w-full sm:w-auto">
      <span className="text-slate-500 shrink-0">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border border-input bg-white px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none flex-1 sm:flex-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 border-b border-slate-200 ${className}`}>
      {children}
    </th>
  );
}

export function TableEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

/**
 * Inline error banner for failed `useQuery` calls — exists so an error state
 * shows up as itself instead of being silently swallowed into a permanent
 * spinner or an "empty" state. Used wherever a list/detail view depends on
 * a single query whose failure would otherwise hide a real bug.
 */
export function QueryError({
  error,
  label,
}: {
  error: unknown;
  label: string;
}) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      Couldn't load {label}: {msg}
    </div>
  );
}
