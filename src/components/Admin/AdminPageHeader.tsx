import * as React from "react";

/**
 * Standard top-of-page header for an admin section: icon-prefixed title, an
 * optional subtitle line, and an action (typically the "New X" button) on the
 * right. Mirrors the look across every `/admin/*` page so they stay visually
 * consistent.
 */
export function AdminPageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Icon className="size-6 text-slate-600" />
          {title}
        </h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
