import type { FC } from "react";

/**
 * Two badge shapes used across the app's status/priority/risk indicators:
 *  - `pill`  → bordered rounded-full (status). Each domain picks its own
 *              per-value bg/text/border classes.
 *  - `tag`   → solid rounded (priority, risk level). Smaller padding, no
 *              border; per-value styles supply bg + text colour.
 *
 * Centralizing the base shape strings means a future visual tweak (e.g.
 * "make all status pills a bit larger") changes one file instead of ten
 * inline className templates spread across the domain badge modules.
 */
export type BadgeShape = "pill" | "tag";

const SHAPE_BASE_CLASS: Record<BadgeShape, string> = {
  pill: "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
  tag: "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
};

/**
 * Builds a badge component for an enum. `labels` maps each enum value to its
 * display string, `styles` maps it to the Tailwind class fragment for
 * background/text/border colour. The returned component takes the enum value
 * via a `value` prop; domain files wrap it in a thin component that preserves
 * the existing public prop name (e.g. `status`, `priority`, `level`).
 */
export function makeEnumBadge<T extends string>(opts: {
  labels: Record<T, string>;
  styles: Record<T, string>;
  shape: BadgeShape;
}): FC<{ value: T }> {
  const baseClass = SHAPE_BASE_CLASS[opts.shape];
  return function EnumBadge({ value }) {
    return (
      <span className={`${baseClass} ${opts.styles[value]}`}>
        {opts.labels[value]}
      </span>
    );
  };
}
