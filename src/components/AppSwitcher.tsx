import { Link } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { visibleApps, type AppDef } from "~/config/apps";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

/**
 * Moves between the platform's apps, and back to the launcher.
 *
 * It names the app you are in, which the header otherwise doesn't: the nav
 * beside it only lists the current app's pages, so without this the set of
 * links would change on navigation with nothing to say why.
 */
export function AppSwitcher({
  current,
  isAdmin,
}: {
  current: AppDef | null;
  isAdmin: boolean;
}) {
  const apps = visibleApps(isAdmin);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch app"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
        >
          <LayoutGrid size={16} className="shrink-0 text-slate-400" />
          <span className="max-w-40 truncate xl:max-w-none">
            {current?.label ?? "All apps"}
          </span>
          <ChevronDown size={13} className="shrink-0 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <p className="px-2 py-1.5 text-xs font-semibold text-slate-500">Apps</p>
        {apps.map((app) => {
          const Icon = app.icon;
          return (
            <DropdownMenuItem key={app.id} asChild>
              <Link to={app.home} className="items-start gap-2.5">
                <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block font-medium">{app.label}</span>
                  <span className="block text-xs text-slate-500">
                    {app.description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/">All apps</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
